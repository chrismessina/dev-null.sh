import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    hashtagBeforeCaret,
    hashtagsIn,
} from '../../resources/js/lib/hashtags.ts';

const tags = (text: string) => hashtagsIn(text).map((hashtag) => hashtag.tag);

await test('finds hashtags by the same rule as Bluesky and the server', () => {
    const cases: [string, string[]][] = [
        ['#PHP and #TypeScript, again #php', ['PHP', 'TypeScript', 'php']],
        ['Shipped in #laravel.', ['laravel']],
        ['Is it #rust?!', ['rust']],
        ['Shipped\n#php', ['php']],
        ['Moved to #node.js and #.net', ['node.js', '.net']],
        ['Learning #c++', ['c++']],
        ['Writing #c#', ['c']],
        ['Year of #2026goals and #1password', ['2026goals', '1password']],
        ['＃laravel', ['laravel']],
        ['#日本語 and #café', ['日本語', 'café']],
        ['🚀 #shipit 🎉', ['shipit']],
        [`#${'a'.repeat(64)}`, ['a'.repeat(64)]],
        ['\n>#php\n>#rust', ['php', 'rust']],
        ['x\uFEFF#php', ['php']],
        ['#go\uFEFFlang', ['go']],
        ['#go\u0085lang', ['go\u0085lang']],
        ['#fe and #faded', ['fe', 'faded']],
    ];

    for (const [text, expected] of cases) {
        assert.deepEqual(tags(text), expected, text);
    }
});

await test('ignores what only looks like a hashtag', () => {
    for (const text of [
        'Fixed in #123',
        'Item #1.',
        '# Feature title',
        '## Problem',
        'Press # to continue',
        'See https://laravel.com/docs#routing',
        'C#',
        '(#php)',
        '#️⃣',
        `#${'a'.repeat(65)}`,
        `#${'क्ष'.repeat(33)}`,
        'a>#php',
        '>>#php',
        'x\u0085#php',
        'plain text without any hashtag',
    ]) {
        assert.deepEqual(hashtagsIn(text), [], text);
    }
});

await test('finds no hex colors, which are colors rather than hashtags', () => {
    assert.deepEqual(
        tags(
            'Brand orange is #ff8a4c, white is #fff, and #ff8a4c80 or #fffa, not #fffff',
        ),
        ['fffff'],
    );
});

await test('finds where every hashtag is, leaving out trailing punctuation', () => {
    assert.deepEqual(hashtagsIn('Café 🎉 with #php.'), [
        { tag: 'php', index: 13, length: 4 },
    ]);
});

await test('finds the hashtag being typed at the end of the prose before the caret', () => {
    const cases: [string, string | null][] = [
        ['#', ''],
        ['Shipping #lar', 'lar'],
        ['Shipping ＃lar', 'lar'],
        ['Moved to #node.', 'node.'],
        ['line\n#ph', 'ph'],
        ['#2026go', '2026go'],
        ['Fixed in #123', null],
        ['Fixed in #123.', null],
        ['Fixed in #123,', null],
        ['\n>#ph', 'ph'],
        ['>>#ph', null],
        ['C#', null],
        ['(#php', null],
        ['#php done', null],
    ];

    for (const [prose, expected] of cases) {
        assert.equal(hashtagBeforeCaret(prose), expected, prose);
    }
});
