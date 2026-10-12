/** Quote integer Id tokens before JSON.parse can round .NET Int64 identifiers.
 * String contents (including embedded JSON/CSV) are scanned as opaque tokens. */
export function parseTradeArchive(raw) {
    let output = '', cursor = 0;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] !== '"') continue;
        const start = i++;
        while (i < raw.length) {
            if (raw[i] === '\\') { i += 2; continue; }
            if (raw[i] === '"') break;
            i++;
        }
        const token = raw.slice(start, i + 1);
        let next = i + 1;
        while (/\s/.test(raw[next] ?? '') && next < raw.length) next++;
        if (raw[next] !== ':' || JSON.parse(token) !== 'Id') continue;
        next++;
        while (/\s/.test(raw[next] ?? '') && next < raw.length) next++;
        const number = /^-?\d+(?=\s*[,}\]])/.exec(raw.slice(next));
        if (!number) continue;
        output += raw.slice(cursor, next) + JSON.stringify(number[0]);
        cursor = next + number[0].length;
        i = cursor - 1;
    }
    return JSON.parse(output + raw.slice(cursor));
}
