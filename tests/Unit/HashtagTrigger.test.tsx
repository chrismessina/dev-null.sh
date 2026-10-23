/// <reference types="node" />
import assert from 'node:assert/strict';
import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, test, vi } from 'vite-plus/test';

let state: unknown[];
let cursor = 0;

vi.doMock('react', () => ({
    ...React,
    useId: () => 'composer',
    useRef: () => ({ current: null }),
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

/**
 * Selects the end of the draft in the composer, as typing it would, and returns what it would suggest.
 */
function triggerAfterTyping(value: string) {
    cursor = 0;
    const textarea = elements(
        MentionTextarea({
            value,
            onValueChange: () => {},
            suggestsHashtags: true,
        }),
    ).find((element) => element.type === 'textarea');
    const onSelect = textarea?.props.onSelect as (event: unknown) => void;

    onSelect({
        currentTarget: {
            value,
            selectionStart: value.length,
            selectionEnd: value.length,
            scrollTop: 0,
            scrollLeft: 0,
            getBoundingClientRect: () => ({ top: 0, left: 0 }),
        },
    });

    return state[0];
}

beforeEach(() => {
    state = [];
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
