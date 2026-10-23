<?php

declare(strict_types=1);

use App\Services\Mentions;

it('finds mentions, lowercased and once each, in order', function (): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->usernames('@NunoMaduro and @taylorotwell, thanks! cc @nunomaduro'))
        ->toBe(['nunomaduro', 'taylorotwell']);
});

it('finds mentions next to punctuation', function (string $text, array $usernames): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->usernames($text))->toBe($usernames);
})->with([
    'sentence end' => ['Thanks @nuno.', ['nuno']],
    'question' => ['Right, @nuno?', ['nuno']],
    'parentheses' => ['(with @nuno)', ['nuno']],
    'line start' => ["Shipped\n@nuno", ['nuno']],
    'hyphenated' => ['Hi @jess-archer', ['jess-archer']],
    'colon' => ['@nuno: look', ['nuno']],
]);

it('ignores what only looks like a mention', function (string $text): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->usernames($text))->toBe([]);
})->with([
    'email' => ['Mail me at nuno@laravel.com'],
    'hashtag' => ['Learning #@nuno'],
    'scoped package' => ['npm i @inertiajs/react'],
    'domain' => ['Try @vue.js'],
    'path' => ['See medium.com/@nuno'],
    'lone at' => ['Meet @ 5pm'],
    'leading hyphen' => ['@-nuno'],
    'trailing hyphen' => ['@nuno-'],
    'double at' => ['@@nuno'],
    'too long' => ['@'.str_repeat('a', 40)],
    'no at symbol' => ['plain text without any mention'],
]);

it('allows usernames of up to 39 characters', function (): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->usernames('@'.str_repeat('a', 39)))->toBe([str_repeat('a', 39)]);
});

it('skips mentions in code', function (): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->usernames("thanks @taylorotwell for `@Override`\n```java\n@Deprecated\nvoid run() {}\n```"))
        ->toBe(['taylorotwell']);
});

it('finds where every mention is, keeping its case', function (): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->positions('@NunoMaduro and @taylorotwell, thanks! cc @nunomaduro'))->toBe([
        ['username' => 'NunoMaduro', 'offset' => 0, 'length' => 11],
        ['username' => 'taylorotwell', 'offset' => 16, 'length' => 13],
        ['username' => 'nunomaduro', 'offset' => 42, 'length' => 11],
    ]);
});

it('counts offsets in characters, not bytes', function (): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->positions('Café 🎉 with @nuno.'))->toBe([
        ['username' => 'nuno', 'offset' => 12, 'length' => 5],
    ]);
});

it('finds no positions for what only looks like a mention', function (): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->positions('Mail nuno@laravel.com, npm i @inertiajs/react, try @vue.js'))->toBe([]);
});

it('skips mentions in inline code and code blocks when finding where they are', function (): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->positions("thanks @taylorotwell for `@Override`, @nuno\n```java\n@Deprecated\nvoid run() {}\n```\ncc @jess-archer"))->toBe([
        ['username' => 'taylorotwell', 'offset' => 7, 'length' => 13],
        ['username' => 'nuno', 'offset' => 38, 'length' => 5],
        ['username' => 'jess-archer', 'offset' => 85, 'length' => 12],
    ]);
});

it('finds no mentions inside a hashtag', function (string $text): void {
    $mentions = resolve(Mentions::class);

    expect($mentions->usernames($text))->toBe(['nuno'])
        ->and($mentions->positions($text))->toBe([
            ['username' => 'nuno', 'offset' => mb_strlen($text) - 5, 'length' => 5],
        ]);
})->with([
    'after punctuation in the tag' => ['Shipping #release:@alice today, thanks @nuno'],
    'in a tag starting a quoted line' => [">#release:@alice\nthanks @nuno"],
    'in a tag after emoji' => ['🚀 #ship:@alice 🚀 @nuno'],
    'in a tag that is too long until its emoji shortcode is replaced' => ['#'.str_repeat('a', 55).':rocket:@alice thanks @nuno'],
]);

it('finds mentions after a hash that cannot start a hashtag', function (string $text): void {
    expect(resolve(Mentions::class)->usernames($text))->toBe(['alice']);
})->with([
    'after a word' => ['C#:@alice'],
    'after code ending in a hashtag' => ['Run `#tag`:@alice'],
]);
