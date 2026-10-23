// Keep these rules in sync with app/Services/Hashtags.php.

// Bluesky's TAG_REGEX (bluesky-social/atproto, packages/api/src/rich-text/util.ts): a "#" or "＃" at the start or after
// whitespace, then anything up to the next whitespace or zero-width character, as long as something in it is neither a
// digit nor punctuation, and not the U+FE0F that makes "#️⃣" an emoji. A "#" right after the ">" that starts a quoted
// line counts too, as the server finds it. The web parses pieces of a body, whose start isn't the start of a line, and
// quoted lines reach it without their ">", so only a ">" after a line break counts here.
const hashtagPattern =
    // oxlint-disable-next-line no-misleading-character-class
    /(?:(?<!\S)|(?<=\n>))[#\uFF03](?!\uFE0F)([^\s\u00AD\u2060\u200A-\u200D\u20E2]*[^\d\s\p{P}\u00AD\u2060\u200A-\u200D\u20E2][^\s\u00AD\u2060\u200A-\u200D\u20E2]*)/gu;

const hexColor = /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export type Hashtag = {
    tag: string;
    index: number;
    length: number;
};

/**
 * The hashtags in a run of prose, where they are and how long they are with the "#", without trailing punctuation. A
 * hex color like "#ff8a4c" is a color (resources/js/lib/colors.ts), not a hashtag. When the prose starts a whole body,
 * its start is the start of a line, as the server reads it.
 */
export function hashtagsIn(text: string, startsText = false): Hashtag[] {
    const start = startsText ? 1 : 0;

    return [
        ...(startsText ? `\n${text}` : text).matchAll(hashtagPattern),
    ].flatMap((match) => {
        const tag = match[1].replace(/\p{P}+$/u, '');

        // Code points, as the server counts them with mb_strlen.
        return Array.from(tag).length > 64 || hexColor.test(tag)
            ? []
            : [{ tag, index: match.index - start, length: tag.length + 1 }];
    });
}

/**
 * The rest of the hashtag after the caret, so accepting a suggestion replaces the whole hashtag rather than only what is
 * before the caret. Trailing punctuation isn't part of a hashtag, so it stays.
 */
export function restOfHashtag(after: string): string {
    // oxlint-disable-next-line no-misleading-character-class
    return (
        /^[^\s\u00AD\u2060\u200A-\u200D\u20E2]*/u.exec(after)?.[0] ?? ''
    ).replace(/\p{P}+$/u, '');
}

/**
 * The hashtag a suggestion completes what was written to. Suggestions are lowercase, so what was written keeps its case
 * when the suggestion starts with it.
 */
export function completedHashtag(written: string, suggestion: string): string {
    const lowered = written.toLowerCase();

    return suggestion.startsWith(lowered)
        ? written + suggestion.slice(lowered.length)
        : suggestion;
}

/**
 * The hashtag being typed at the end of the prose before the caret, without its "#", so the composer can suggest
 * hashtags from the bare "#" on. Digits and punctuation alone, like "#123.", are left to issue references.
 */
export function hashtagBeforeCaret(prose: string): string | null {
    // oxlint-disable-next-line no-misleading-character-class
    const query =
        /(?:(?<!\S)|(?<=\n>))[#\uFF03]([^\s\u00AD\u2060\u200A-\u200D\u20E2]*)$/u.exec(
            prose,
        )?.[1];

    return query === undefined || /^[\d\p{P}]+$/u.test(query) ? null : query;
}
