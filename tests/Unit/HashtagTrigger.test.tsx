/// <reference types="node" />
import assert from 'node:assert/strict';
import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, test, vi } from 'vite-plus/test';

type FakeTextarea = ReturnType<typeof fakeTextarea>;

let state: unknown[];
let cursor = 0;
// Refs live across renders like React's, the first being the textarea's.
let refs: { current: unknown }[];
let refCursor = 0;
let frames: (() => void)[];

vi.doMock('react', () => ({
    ...React,
    useId: () => 'composer',
    useRef: (initial: unknown) => {
        const index = refCursor++;
        refs[index] ??= { current: initial };
        return refs[index];
    },
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
    const textarea = {
        value,
        selectionStart: caret,
        selectionEnd: caret,
        scrollTop: 0,
        scrollLeft: 0,
        getBoundingClientRect: () => ({ top: 0, left: 0 }),
        focus: () => {},
        setSelectionRange: (start: number, end: number) => {
            textarea.selectionStart = start;
            textarea.selectionEnd = end;
        },
    };

    return textarea;
}

const taylor = {
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
} as never;

function render(
    value: string,
    onValueChange: (value: string) => void = () => {},
    props: Record<string, unknown> = {},
) {
    cursor = 0;
    refCursor = 0;

    return elements(
        MentionTextarea({
            value,
            onValueChange,
            suggestsHashtags: true,
            ...props,
        }),
    );
}

function textareaProps(value: string) {
    return render(value).find((element) => element.type === 'textarea')
        ?.props as Record<string, (event: unknown) => void>;
}

function flushFrames() {
    for (const frame of frames.splice(0)) frame();
}

/**
 * Types into the composer, as an input event with the caret at its end, and returns what it would suggest.
 */
function type(
    textarea: FakeTextarea,
    onValueChange: (value: string) => void = () => {},
) {
    (
        render(textarea.value, onValueChange).find(
            (element) => element.type === 'textarea',
        )?.props.onChange as (event: unknown) => void
    )({
        currentTarget: textarea,
        nativeEvent: { isComposing: false },
    });

    return state[0];
}

/**
 * The selection event a browser fires when the caret moves, whether by typing, a click or an arrow key.
 */
function select(textarea: FakeTextarea) {
    textareaProps(textarea.value).onSelect({ currentTarget: textarea });

    return state[0];
}

/**
 * Types the draft into the composer, ending with the caret at its end, and returns what it would suggest.
 */
function triggerAfterTyping(value: string) {
    return type(fakeTextarea(value));
}

/**
 * Moves the caret into the draft without typing, as a click or an arrow key does, and returns what it would suggest.
 */
function triggerAfterMovingTo(value: string, caret: number) {
    return select(fakeTextarea(value, caret));
}

/**
 * Accepts the first suggestion for what is being typed, by clicking it, and returns the draft it makes and where the
 * caret ends up.
 */
function acceptSuggestion(
    value: string,
    caret: number,
    trigger: { kind: 'hashtag' | 'mention'; start: number },
    hashtags: string[] = [],
    props: Record<string, unknown> = {},
): { value: string; caret: number } {
    const textarea = fakeTextarea(value, caret);
    const query = value.slice(trigger.start + 1, caret);
    let next = value;

    render(value);
    refs[0].current = textarea;
    state[0] = { ...trigger, query };
    state[1] = { top: 0, left: 0 };
    state[5] = { query: query.toLowerCase(), hashtags };
    const option = render(value, (changed) => (next = changed), props).find(
        (element) =>
            element.props['data-test'] === `${trigger.kind}-suggestion`,
    );

    (option?.props.onClick as () => void)();
    flushFrames();

    return { value: next, caret: textarea.selectionStart };
}

/**
 * Accepts a hashtag suggestion for the hashtag being typed, by clicking it, and returns the draft it makes.
 */
function accept(value: string, caret: number, hashtag: string): string {
    return acceptSuggestion(
        value,
        caret,
        { kind: 'hashtag', start: value.lastIndexOf('#', caret - 1) },
        [hashtag],
    ).value;
}

/**
 * Accepts @taylorotwell for the mention being typed, by clicking it.
 */
function acceptTaylor(
    value: string,
    caret: number,
    props: Record<string, unknown> = {},
) {
    return acceptSuggestion(
        value,
        caret,
        { kind: 'mention', start: value.lastIndexOf('@', caret - 1) },
        [],
        { org: 'org', members: [taylor], ...props },
    );
}

beforeEach(() => {
    state = [];
    refs = [];
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (frame: () => void) => {
        frames.push(frame);

        return 0;
    });
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
    assert.equal(
        acceptTaylor('Thanks @tayotwell, again', 10).value,
        'Thanks @taylorotwell, again',
    );
});

test('accepting a mention right before another one keeps them apart', () => {
    assert.deepEqual(acceptTaylor('@ta@alice', 3), {
        value: '@taylorotwell @alice',
        caret: 14,
    });
});

test('accepting a hashtag right before code keeps the code', () => {
    assert.equal(accept('#no`keep`', 3, 'node.js'), '#node.js `keep`');
});

test('accepting at the length limit puts the caret right after what was accepted', () => {
    assert.deepEqual(acceptTaylor('@taylorotwell🚀', 3, { maxLength: 14 }), {
        value: '@taylorotwell🚀',
        caret: 13,
    });
});

test('moving the caret away and back does not reopen hashtag suggestions', () => {
    const textarea = fakeTextarea('#la');

    assert.equal(type(textarea)?.constructor, Object);
    assert.equal(select(textarea)?.constructor, Object);

    textarea.setSelectionRange(2, 2);
    assert.equal(select(textarea), null);

    textarea.setSelectionRange(3, 3);
    assert.equal(select(textarea), null);
});

test('suggests hashtags after typing an emoji shortcode before them', () => {
    const textarea = fakeTextarea(':fire: #la');

    let draft = textarea.value;

    type(textarea, (changed) => (draft = changed));
    // React puts the new draft into the textarea when it renders, after the input event.
    textarea.value = draft;
    flushFrames();

    assert.equal(textarea.value, '🔥 #la');
    assert.deepEqual(select(textarea), {
        kind: 'hashtag',
        start: 3,
        query: 'la',
    });
});

test('extending the selection and collapsing it again does not reopen hashtag suggestions', () => {
    const textarea = fakeTextarea('#laravel', 3);

    assert.equal(type(textarea)?.constructor, Object);

    textarea.setSelectionRange(3, 4);
    assert.equal(select(textarea), null);

    textarea.setSelectionRange(3, 3);
    assert.equal(select(textarea), null);
});

test('suggests hashtags after a shortcode is replaced, even when the browser reports the caret at the end first', () => {
    const textarea = fakeTextarea(':fire: #la tail', 10);
    let draft = textarea.value;

    type(textarea, (changed) => (draft = changed));
    // React puts the new draft into the textarea, which moves the caret to its end until the frame puts it back.
    textarea.value = draft;
    textarea.setSelectionRange(draft.length, draft.length);
    select(textarea);
    flushFrames();

    assert.equal(textarea.value, '🔥 #la tail');
    assert.deepEqual(state[0], { kind: 'hashtag', start: 3, query: 'la' });
    assert.deepEqual(select(textarea), {
        kind: 'hashtag',
        start: 3,
        query: 'la',
    });
});
