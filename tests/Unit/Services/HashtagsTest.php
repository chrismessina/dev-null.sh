<?php

declare(strict_types=1);

use App\Services\Hashtags;

it('finds hashtags, lowercased and once each, in order', function (): void {
    $hashtags = resolve(Hashtags::class);

    expect($hashtags->tags('#PHP and #TypeScript, again #php'))
        ->toBe(['php', 'typescript']);
});

it('finds hashtags by the same rule as Bluesky', function (string $text, array $tags): void {
    $hashtags = resolve(Hashtags::class);

    expect($hashtags->tags($text))->toBe($tags);
})->with([
    'sentence end' => ['Shipped in #laravel.', ['laravel']],
    'trailing punctuation run' => ['Is it #rust?!', ['rust']],
    'line start' => ["Shipped\n#php", ['php']],
    'inner punctuation' => ['Moved to #node.js and #.net', ['node.js', '.net']],
    'symbols' => ['Learning #c++', ['c++']],
    'trailing hash' => ['Writing #c#', ['c']],
    'digits and letters' => ['Year of #2026goals and #1password', ['2026goals', '1password']],
    'fullwidth hash' => ['＃laravel', ['laravel']],
    'non-latin' => ['#日本語 and #café', ['日本語', 'café']],
    'emoji neighbor' => ['🚀 #shipit 🎉', ['shipit']],
    'up to 64 characters' => ['#'.str_repeat('a', 64), [str_repeat('a', 64)]],
    'quote marker' => [">#php\n>#rust", ['php', 'rust']],
    'byte order mark' => ["x\u{FEFF}#php", ['php']],
    'ends at a byte order mark' => ["#go\u{FEFF}lang", ['go']],
    'next line is not whitespace' => ["#go\u{85}lang", ["go\u{85}lang"]],
]);

it('ignores what only looks like a hashtag', function (string $text): void {
    $hashtags = resolve(Hashtags::class);

    expect($hashtags->tags($text))->toBe([]);
})->with([
    'issue reference' => ['Fixed in #123'],
    'digits and punctuation' => ['Item #1.'],
    'heading' => ['# Feature title'],
    'double hash heading' => ['## Problem'],
    'lone hash' => ['Press # to continue'],
    'url fragment' => ['See https://laravel.com/docs#routing'],
    'mid-word' => ['C#'],
    'after parenthesis' => ['(#php)'],
    'keycap emoji' => ['#️⃣'],
    'too long' => ['#'.str_repeat('a', 65)],
    'too many characters' => ['#'.str_repeat('क्ष', 33)],
    'after a mid-line quote marker' => ['a>#php'],
    'after next line' => ["x\u{85}#php"],
    'hex color' => ['Brand orange is #ff8a4c'],
    'short hex color' => ['White is #fff'],
    'hex color with alpha' => ['#ff8a4c80 and #fffa'],
    'no hash' => ['plain text without any hashtag'],
]);

it('keeps hex-looking values of other lengths as hashtags', function (): void {
    $hashtags = resolve(Hashtags::class);

    expect($hashtags->tags('#fe and #faded'))->toBe(['fe', 'faded']);
});

it('skips hashtags in code', function (): void {
    $hashtags = resolve(Hashtags::class);

    expect($hashtags->tags("loving #php for `#[Attribute]`\n```c\n#include <stdio.h>\n```"))
        ->toBe(['php']);
});

it('finds where every hashtag is, keeping its case and leaving out trailing punctuation', function (): void {
    $hashtags = resolve(Hashtags::class);

    expect($hashtags->positions('#PHP and #TypeScript, again #php.'))->toBe([
        ['tag' => 'PHP', 'offset' => 0, 'length' => 4],
        ['tag' => 'TypeScript', 'offset' => 9, 'length' => 11],
        ['tag' => 'php', 'offset' => 28, 'length' => 4],
    ]);
});

it('counts offsets in characters, not bytes', function (): void {
    $hashtags = resolve(Hashtags::class);

    expect($hashtags->positions('Café 🎉 with #php.'))->toBe([
        ['tag' => 'php', 'offset' => 12, 'length' => 4],
    ]);
});

it('skips hashtags in inline code and code blocks when finding where they are', function (): void {
    $hashtags = resolve(Hashtags::class);

    expect($hashtags->positions("loving #php for `#[Attribute]`, #rust\n```c\n#include <stdio.h>\n```\nalso #go"))->toBe([
        ['tag' => 'php', 'offset' => 7, 'length' => 4],
        ['tag' => 'rust', 'offset' => 32, 'length' => 5],
        ['tag' => 'go', 'offset' => 71, 'length' => 3],
    ]);
});
