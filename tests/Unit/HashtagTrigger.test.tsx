/// <reference types="node" />
import assert from 'node:assert/strict';
import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, test, vi } from 'vite-plus/test';

let state: unknown[];
let cursor = 0;
let textareaElement: unknown = null;

vi.doMock('react', () => ({
    ...React,
    useId: () => 'composer',
    useRef: () => ({ current: textareaElement }),
    useEffectEvent: (callback: unknown) => callback,
    useEffect: () => {},
    useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [
            state[index],
            (value: unknown) => {
                state[index] =
                    typeof value === 'function' ? value(state[index]) : value;
            },
        ];
    },
}));
vi.doMock('react-dom', () => ({
    createPortal: (children: unknown) => children,
}));
vi.doMock('@inertiajs/react', () => ({
    usePage: () => ({ props: { repository: 'dev-null-sh/dev-null.sh' } }),
}));
vi.doMock('../../resources/js/components/user-avatar', () => ({
    UserAvatar: () => null,
}));

const { MentionTextarea } =
    await import('../../resources/js/components/mention-textarea');

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
    if (!React.isValidElement(node)) return [];
    const element = node as Element;
    return [
        element,
        ...React.Children.toArray(element.props.children as ReactNode).flatMap(
            elements,
        ),
    ];
}

function fakeTextarea(value: string, caret = value.length) {
    return {
        value,
        selectionStart: caret,
        selectionEnd: caret,
        scrollTop: 0,
        scrollLeft: 0,
        getBoundingClientRect: () => ({ top: 0, left: 0 }),
        focus: () => {},
        setSelectionRange: () => {},
    };
}

function render(
    value: string,
    onValueChange: (value: string) => void = () => {},
) {
    cursor = 0;

    return elements(
        MentionTextarea({ value, onValueChange, suggestsHashtags: true }),
    );
}

function textareaProps(value: string) {
    return render(value).find((element) => element.type === 'textarea')
        ?.props as Record<string, (event: unknown) => void>;
}

/**
 * Types the draft into the composer, ending with the caret at its end, and returns what it would suggest.
 */
function triggerAfterTyping(value: string) {
    textareaProps(value).onChange({
        currentTarget: fakeTextarea(value),
        nativeEvent: { isComposing: false },
    });

    return state[0];
}

/**
 * Moves the caret into the draft without typing, as a click or an arrow key does, and returns what it would suggest.
 */
function triggerAfterMovingTo(value: string, caret: number) {
    textareaProps(value).onSelect({
        currentTarget: fakeTextarea(value, caret),
    });

    return state[0];
}

/**
 * Accepts a hashtag suggestion for the hashtag being typed, by clicking it, and returns the draft it makes.
 */
function accept(value: string, caret: number, hashtag: string): string {
    textareaElement = fakeTextarea(value, caret);
    const start = value.lastIndexOf('#', caret - 1);
    const query = value.slice(start + 1, caret);
    let next = value;

    state[0] = { kind: 'hashtag', start, query };
    state[1] = { top: 0, left: 0 };
    state[5] = { query: query.toLowerCase(), hashtags: [hashtag] };
    const option = render(value, (changed) => (next = changed)).find(
        (element) => element.props['data-test'] === 'hashtag-suggestion',
    );

    (option?.props.onClick as () => void)();

    return next;
}

beforeEach(() => {
    state = [];
    textareaElement = null;
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('window', {
        innerWidth: 1024,
        innerHeight: 768,
        getComputedStyle: () => ({
            getPropertyValue: () => '',
            lineHeight: '20px',
        }),
    });
    vi.stubGlobal('document', {
        body: { appendChild: () => {} },
        createElement: () => ({
            style: { setProperty: () => {} },
            appendChild: () => {},
            remove: () => {},
            offsetTop: 0,
            offsetLeft: 0,
        }),
    });
});

test('suggests hashtags after the ">" that starts a quoted line, even at the start of the draft', () => {
    assert.deepEqual(triggerAfterTyping('>#ph'), {
        kind: 'hashtag',
        start: 1,
        query: 'ph',
    });
    assert.deepEqual(triggerAfterTyping('line\n>#ph'), {
        kind: 'hashtag',
        start: 6,
        query: 'ph',
    });
});

test('suggests no hashtags after a ">" that does not start a quoted line', () => {
    assert.equal(triggerAfterTyping('>>#ph'), null);
    assert.equal(triggerAfterTyping('`x`>#ph'), null);
});

test('suggests people for a mention after the zero-width joiner that ends a hashtag', () => {
    assert.deepEqual(triggerAfterTyping('Shipping #👩\u200D💻:@al'), {
        kind: 'mention',
        start: 16,
        query: 'al',
    });
});

test('suggests people after a hash inside code', () => {
    assert.deepEqual(triggerAfterTyping('Run `#tag`:@al'), {
        kind: 'mention',
        start: 11,
        query: 'al',
    });
});

test('suggests hashtags rather than people for a mention inside a hashtag', () => {
    assert.deepEqual(triggerAfterTyping('Shipping #release:@al'), {
        kind: 'hashtag',
        start: 9,
        query: 'release:@al',
    });
});

test('accepting a hashtag replaces the whole word, not only what is before the caret', () => {
    assert.equal(
        accept('Try #node.js today', 6, 'node.js'),
        'Try #node.js today',
    );
    assert.equal(accept('Try #nod today', 6, 'node.js'), 'Try #node.js today');
    assert.equal(accept('Try #c++ now', 6, 'cplusplus'), 'Try #cplusplus now');
    assert.equal(accept('Try #nodx, ok', 7, 'node.js'), 'Try #node.js, ok');
});

test('accepting a hashtag keeps the case of what was already written', () => {
    assert.equal(
        accept('Shipping #Laravel', 17, 'laravel'),
        'Shipping #Laravel ',
    );
    assert.equal(accept('Shipping #Lar', 13, 'laravel'), 'Shipping #Laravel ');
    assert.equal(accept('Shipping #Lar', 13, 'lamp'), 'Shipping #lamp ');
});

test('suggests hashtags while typing, not when the caret moves into one', () => {
    assert.equal(triggerAfterMovingTo('Try #node.js today', 6), null);
    assert.deepEqual(triggerAfterMovingTo('Try @tay today', 7), {
        kind: 'mention',
        start: 4,
        query: 'ta',
    });
});

test('accepting a mention replaces the whole username, not only what is before the caret', () => {
    const value = 'Thanks @tayotwell, again';

    textareaElement = fakeTextarea(value, 10);
    state[0] = { kind: 'mention', start: 7, query: 'ta' };
    state[1] = { top: 0, left: 0 };
    let next = value;
    cursor = 0;
    const option = elements(
        MentionTextarea({
            value,
            onValueChange: (changed: string) => (next = changed),
            org: 'org',
            members: [
                {
                    user: {
                        id: 'taylorotwell',
                        username: 'taylorotwell',
                        name: 'Taylor',
                        lane: 1,
                    },
                    role: 'contributor',
                    read_through_id: 0,
                    is_followed: false,
                    suggests_mentions: true,
                } as never,
            ],
        }),
    ).find((element) => element.props['data-test'] === 'mention-suggestion');

    (option?.props.onClick as () => void)();

    assert.equal(next, 'Thanks @taylorotwell, again');
});
