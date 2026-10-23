<?php

declare(strict_types=1);

use App\Actions\CreateWorldReply;
use App\Models\Commit;
use App\Models\User;
use App\Services\Hashtags;

it('captures the hashtags of a commit in prose, lowercased and once each', function (): void {
    $author = User::factory()->create();

    $this->actingAs($author)->post(route('commit.store'), [
        'body' => "Shipping #Laravel with #php, `#[Attribute]` and #fff.\n```c\n#include <stdio.h>\n```\nmore #PHP",
    ])->assertRedirect()->assertSessionHasNoErrors();

    expect($author->commits()->sole()->hashtags)->toBe(['laravel', 'php']);
});

it('finds mentions and the link card in the body as kept, so emoji shortcodes cannot hide a hashtag', function (): void {
    $author = User::factory()->create();
    $alice = User::factory()->create(['username' => 'alice']);
    $rockets = '#'.str_repeat(':rocket:', 32);

    $this->actingAs($author)->post(route('commit.store'), ['body' => "{$rockets}:@{$alice->username}"])
        ->assertRedirect()->assertSessionHasNoErrors();
    $this->actingAs($author)->post(route('commit.store'), ['body' => "{$rockets}:https://example.com"])
        ->assertRedirect()->assertSessionHasNoErrors();

    [$mentioning, $linking] = $author->commits()->oldest('id')->get()->all();

    expect($mentioning->hashtags)->toHaveCount(1)
        ->and($mentioning->mentions)->toBe([])
        ->and($linking->hashtags)->toHaveCount(1)
        ->and($linking->link_preview_id)->toBeNull();
});

it('captures no hashtags in a commit without any', function (): void {
    $author = User::factory()->create();

    $this->actingAs($author)->post(route('commit.store'), ['body' => 'Fixed in #123'])
        ->assertRedirect()->assertSessionHasNoErrors();

    expect($author->commits()->sole()->hashtags)->toBe([]);
});

it('backfills the hashtags of earlier commits without changing captured ones or commit text', function (): void {
    $legacy = Commit::factory()->create([
        'body' => "Shipping #Laravel with `#php`>#css\n```c\n#include <stdio.h>\n```\n#rust. #ff8a4c #123\n>#quoted",
        'hashtags' => null,
    ]);
    $captured = Commit::factory()->create(['body' => 'Shipping #go', 'hashtags' => ['go']]);
    $plain = Commit::factory()->create(['body' => 'It was DNS.', 'hashtags' => null]);
    $erased = Commit::factory()->create(['body' => '', 'hashtags' => null, 'deleted_at' => now()]);
    $expanding = Commit::factory()->create(['body' => '#'.str_repeat('İ', 64), 'hashtags' => null]);
    $body = $legacy->body;
    $updatedAt = $legacy->updated_at;

    $migration = require database_path('migrations/2026_10_22_200002_backfill_commit_hashtags.php');
    $migration->up();

    expect($legacy->refresh()->hashtags)->toBe(['laravel', 'rust', 'quoted'])
        ->and(resolve(Hashtags::class)->tags($legacy->body))->toBe($legacy->hashtags)
        ->and($legacy->body)->toBe($body)
        ->and($legacy->updated_at->equalTo($updatedAt))->toBeTrue()
        ->and($captured->refresh()->hashtags)->toBe(['go'])
        ->and($plain->refresh()->hashtags)->toBe([])
        ->and(Commit::withTrashed()->find($erased->id)->hashtags)->toBeNull()
        ->and($expanding->refresh()->hashtags)->toBe(resolve(Hashtags::class)->tags($expanding->body));
});

it('captures the hashtags of the body as it is kept, after emoji shortcodes', function (): void {
    $author = User::factory()->create();

    $this->actingAs($author)->post(route('commit.store'), ['body' => 'Launch day #:rocket: and #php'])
        ->assertRedirect()->assertSessionHasNoErrors();

    $commit = $author->commits()->sole();

    expect($commit->hashtags)->toBe(['🚀', 'php'])
        ->and($commit->hashtags)->toBe(resolve(Hashtags::class)->tags($commit->body));
});

it('captures the hashtags of the replies World writes', function (): void {
    $commit = Commit::factory()->for(User::factory()->create(['name' => 'Ada #rust']))->create(['body' => 'Hello, World!']);

    resolve(CreateWorldReply::class)->handle($commit);

    expect($commit->replies()->sole()->hashtags)->toBe(['rust']);
});
