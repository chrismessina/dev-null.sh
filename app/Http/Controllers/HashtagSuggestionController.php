<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\ListHashtagSuggestionsRequest;
use App\Models\User;
use App\Queries\HashtagSuggestionsQuery;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\JsonResponse;

final readonly class HashtagSuggestionController
{
    public function index(#[CurrentUser] User $user, ListHashtagSuggestionsRequest $request, HashtagSuggestionsQuery $suggestions): JsonResponse
    {
        return response()->json([
            'hashtags' => $suggestions->get($user, $request->string('q')->value()),
        ]);
    }
}
