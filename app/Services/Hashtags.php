<?php

declare(strict_types=1);

namespace App\Services;

final readonly class Hashtags
{
    /**
     * What a mention or a link can't follow: a "#" where a hashtag can start (at the start, after whitespace or after a
     * ">"), then the rest of the word, up to where a hashtag would end or a backtick. So none starts inside a hashtag, as
     * "#release:@alice" or "#docs:example.com" would, while "[#12](https://…)", "C#:@alice" or a "#" in code don't stop
     * one. Bounded, as PCRE only looks behind so far, which is well past the longest hashtag.
     */
    public const string WordSoFar = '(?<![^'.self::Whitespace.'>])[#＃][^\x60'.self::Whitespace.self::ZeroWidth.']{0,254}';

    /**
     * The characters JavaScript's \s matches.
     */
    private const string Whitespace = '\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    private const string ZeroWidth = '\x{AD}\x{2060}\x{200A}-\x{200D}\x{20E2}';

    /**
     * Bluesky's TAG_REGEX (bluesky-social/atproto, packages/api/src/rich-text/util.ts): a "#" or "＃" at the start or
     * after whitespace, then anything up to the next whitespace or zero-width character, as long as something in it is
     * neither a digit nor punctuation, and not the U+FE0F that makes "#️⃣" an emoji. Whitespace is JavaScript's, so the
     * web finds the same tags, and a "#" right after the ">" that starts a quoted line counts, because the web shows the
     * line without it.
     */
    private const string Pattern = '/(?:(?<![^'.self::Whitespace.'])|(?<=\n>))[#＃](?!\x{FE0F})('
        .'[^'.self::Whitespace.self::ZeroWidth.']*'
        .'[^0-9'.self::Whitespace.'\p{P}'.self::ZeroWidth.']'
        .'[^'.self::Whitespace.self::ZeroWidth.']*)/u';

    private const int MAXIMUM_LENGTH = 64;

    public function __construct(private CodeSpans $codeSpans)
    {
        //
    }

    /**
     * Finds the hashtags in the text, lowercased and once each, in order, by Bluesky's rule: trailing punctuation is
     * not part of the tag, so "#php." is "php" and "#c#" is "c". A tag is at most 64 characters, where Bluesky counts
     * graphemes, because PHP and browsers split some scripts into graphemes differently. Unlike Bluesky, a hashtag in
     * code doesn't count (so "#include" or "#[Attribute]" are not tags), and neither does a hex color like "#ff8a4c" or
     * "#fff", which the web shows as a color instead. Keep the rules in sync with resources/js/lib/hashtags.ts.
     *
     * @return list<string>
     */
    public function tags(string $text): array
    {
        return array_values(array_unique(array_map(
            fn (array $position): string => mb_strtolower($position['tag']),
            $this->positions($text),
        )));
    }

    /**
     * Finds where each hashtag is, by the same rules, so a client can link it like the web does. The tag keeps its
     * case, and the offset and length count characters in the whole text and include the "#".
     *
     * @return list<array{tag: string, offset: int, length: int}>
     */
    public function positions(string $text): array
    {
        $positions = [];
        $offset = 0;

        foreach ($this->codeSpans->split($text) as $index => $part) {
            if ($index % 2 === 0) {
                // Only the text's own start is the start of a line, so it is matched as one, after a line break.
                $start = $index === 0 ? 1 : 0;
                preg_match_all(self::Pattern, $index === 0 ? "\n{$part}" : $part, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);

                foreach ($matches as $match) {
                    $tag = (string) preg_replace('/\p{P}+$/u', '', $match[1][0]);

                    if (mb_strlen($tag) > self::MAXIMUM_LENGTH || preg_match('/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $tag) === 1) {
                        continue;
                    }

                    $positions[] = [
                        'tag' => $tag,
                        'offset' => $offset + mb_strlen(mb_strcut($part, 0, $match[0][1] - $start)),
                        'length' => mb_strlen($tag) + 1,
                    ];
                }
            }

            $offset += mb_strlen($part);
        }

        return $positions;
    }
}
