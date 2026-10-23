<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Each commit is updated on its own, outside a transaction, so the backfill never holds locks for long, and only
     * while its body is still the one read, so a commit erased meanwhile doesn't get its hashtags back.
     */
    public $withinTransaction = false;

    public function up(): void
    {
        DB::table('commits')->whereNull('hashtags')->where('body', '!=', '')->select(['id', 'body'])
            ->chunkById(200, function (Collection $commits): void {
                /** @var Collection<int, object{id: string, body: string}> $commits */
                foreach ($commits as $commit) {
                    DB::table('commits')->where('id', $commit->id)->where('body', $commit->body)->whereNull('hashtags')->update([
                        'hashtags' => json_encode($this->tags($commit->body), JSON_THROW_ON_ERROR),
                    ]);
                }
            });
    }

    /**
     * Freeze the parser here so future application changes cannot change this backfill.
     *
     * @return list<string>
     */
    private function tags(string $body): array
    {
        $prose = (string) preg_replace('/((?<![^\n])`{3,}[^`\r\n]*\r?\n(?:[\s\S]*?\r?\n)?`{3,}[ \t]*(?![^\r\n])|`[^`\r\n]+`)/', ' ', $body);

        preg_match_all('/(?:(?<![^\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}])|(?<=\n>))[#＃](?!\x{FE0F})([^\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}\x{AD}\x{2060}\x{200A}-\x{200D}\x{20E2}]*[^0-9\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}\p{P}\x{AD}\x{2060}\x{200A}-\x{200D}\x{20E2}][^\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}\x{AD}\x{2060}\x{200A}-\x{200D}\x{20E2}]*)/u', "\n{$prose}", $matches);

        $tags = array_filter(
            array_map(fn (string $tag): string => (string) preg_replace('/\p{P}+$/u', '', $tag), $matches[1]),
            fn (string $tag): bool => mb_strlen($tag) <= 64 && preg_match('/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $tag) !== 1,
        );

        return array_values(array_unique(array_map(mb_strtolower(...), $tags)));
    }
};
