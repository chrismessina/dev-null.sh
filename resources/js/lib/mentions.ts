// Keep this rule in sync with app/Services/Mentions.php.

// A "#" where a hashtag can start (at the start, after whitespace or after a ">"), then the rest of the word, up to where
// a hashtag would end or a backtick. A mention or a link can't start inside it, so neither starts inside a hashtag.
// Bounded like App\Services\Hashtags::WordSoFar, which PCRE needs. Keep in sync with urls.ts.
export const wordSoFar = String.raw`(?<![^\s>])[#\uFF03][^\x60\s\u00AD\u2060\u200A-\u200D\u20E2]{0,254}`;

// A GitHub username after an "@" that doesn't follow a letter, digit, "_", ".", "/", "@" or "-", doesn't start inside a
// word that starts with "#", and doesn't run into a path or a domain, so emails, hashtags like "#release:@alice",
// "@inertiajs/react" and "@vue.js" are not mentions.
export const mentionPattern = new RegExp(
    String.raw`(?<![\p{L}\p{N}_./@-])(?<!${wordSoFar})@([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})(?![A-Za-z0-9_@/-]|\.[A-Za-z0-9])`,
    'gu',
);
