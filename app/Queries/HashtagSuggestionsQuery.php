<?php

declare(strict_types=1);

namespace App\Queries;

use App\Models\Commit;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final readonly class HashtagSuggestionsQuery
{
    /**
     * The hashtags of other people's commits are only suggested for this long, so suggestions follow what people talk
     * about now, and the query only reads recent commits besides the user's own.
     */
    private const int RECENT_DAYS = 30;

    /**
     * The user's own hashtags come first, the ones they use most, then the ones they used last, so a bare "#" already
     * suggests them. Then the hashtags of recent commits the user may see, the ones the most people used first. Never
     * from commits the user may not see, or by people they muted or across a block. The term is what follows the "#", so
     * a second "#" is part of it.
     *
     * @return list<string>
     */
    public function get(User $user, string $term, int $limit = 6): array
    {
        $term = Str::of($term)
            ->trim()
            ->lower()
            ->value();

        $escaped = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $term);

        /** @var list<string> $hashtags */
        $hashtags = Commit::query()
            ->visibleTo($user)
            ->withoutMutedAuthorsFor($user)
            ->where(fn (Builder $query): Builder => $query
                ->where('commits.user_id', $user->id)
                ->orWhere('commits.created_at', '>=', now()->subDays(self::RECENT_DAYS)))
            ->crossJoin(DB::raw('jsonb_array_elements_text(commits.hashtags) as tag'))
            ->whereRaw("tag LIKE ? ESCAPE '!'", ["{$escaped}%"])
            ->groupBy('tag')
            ->orderByRaw('COUNT(*) FILTER (WHERE commits.user_id = ?) DESC', [$user->id])
            ->orderByRaw('MAX(commits.created_at) FILTER (WHERE commits.user_id = ?) DESC NULLS LAST', [$user->id])
            ->orderByRaw('COUNT(DISTINCT commits.user_id) DESC')
            ->orderBy('tag')
            ->limit($limit)
            ->toBase()
            ->pluck('tag')
            ->all();

        return $hashtags;
    }
}
