<?php

declare(strict_types=1);

use App\Enums\CommitStatus;
use App\Models\Commit;
use App\Models\User;

it('suggests the hashtags the user uses most without a term, most recently used first among equals', function (): void {
    $user = User::factory()->create();
    Commit::factory()->for($user)->create(['hashtags' => ['php', 'laravel'], 'created_at' => now()->subDays(90)]);
    Commit::factory()->for($user)->create(['hashtags' => ['php'], 'created_at' => now()->subDays(60)]);
    Commit::factory()->for($user)->create(['hashtags' => ['rust'], 'created_at' => now()->subDay()]);

    $this->actingAs($user)->getJson('/search/hashtags?q=')
        ->assertOk()
        ->assertExactJson(['hashtags' => ['php', 'rust', 'laravel']]);
});

it("suggests the user's own matches first, then the ones the most people used lately", function (): void {
    $user = User::factory()->create();
    Commit::factory()->for($user)->create(['hashtags' => ['laravelconf']]);
    Commit::factory()->count(2)->create(['hashtags' => ['laravel']]);
    Commit::factory()->create(['hashtags' => ['larastan']]);
    Commit::factory()->create(['hashtags' => ['php']]);

    $this->actingAs($user)->getJson('/search/hashtags?q=LARA')
        ->assertOk()
        ->assertExactJson(['hashtags' => ['laravelconf', 'laravel', 'larastan']]);
});

it('never suggests hashtags from commits the user may not see, by people they muted, or from long ago', function (): void {
    $user = User::factory()->create();
    $muted = User::factory()->create();
    $blocked = User::factory()->create();
    $user->muting()->attach($muted);
    $blocked->blocking()->attach($user);
    Commit::factory()->create(['hashtags' => ['pending'], 'status' => CommitStatus::Pending]);
    Commit::factory()->for($muted)->create(['hashtags' => ['muted']]);
    Commit::factory()->for($blocked)->create(['hashtags' => ['blocked']]);
    Commit::factory()->create(['hashtags' => ['stale'], 'created_at' => now()->subDays(31)]);
    Commit::factory()->for($user)->create(['hashtags' => ['mine'], 'status' => CommitStatus::Pending, 'created_at' => now()->subYear()]);

    $this->actingAs($user)->getJson('/search/hashtags?q=')
        ->assertOk()
        ->assertExactJson(['hashtags' => ['mine']]);
});

it('suggests at most six hashtags', function (): void {
    $user = User::factory()->create();
    Commit::factory()->for($user)->create(['hashtags' => ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']]);

    $this->actingAs($user)->getJson('/search/hashtags?q=a')
        ->assertOk()
        ->assertJsonCount(6, 'hashtags');
});

it('matches the term literally', function (): void {
    $user = User::factory()->create();
    Commit::factory()->for($user)->create(['hashtags' => ['snake_case', 'snakexcase']]);

    $this->actingAs($user)->getJson('/search/hashtags?q=snake_')
        ->assertOk()
        ->assertExactJson(['hashtags' => ['snake_case']]);
});

it('matches the term as typed after the "#", whatever the script', function (): void {
    $user = User::factory()->create();
    Commit::factory()->for($user)->create(['hashtags' => ['ｌａｒａｖｅｌ', '#php', 'php']]);

    $this->actingAs($user)->getJson('/search/hashtags?q='.urlencode('Ｌ'))
        ->assertOk()
        ->assertExactJson(['hashtags' => ['ｌａｒａｖｅｌ']]);

    $this->actingAs($user)->getJson('/search/hashtags?q='.urlencode('#ph'))
        ->assertOk()
        ->assertExactJson(['hashtags' => ['#php']]);
});

it('only suggests hashtags to people who are signed in', function (): void {
    $this->getJson('/search/hashtags?q=php')->assertUnauthorized();
});
