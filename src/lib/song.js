/* Song parsing: chord sheets, strumming patterns (incl. Ultimate Guitar JSON), ASCII tab blocks. */
(function (root, factory) {
  const theory = (typeof module === 'object' && module.exports) ? require('./theory.js') : root.RCC.theory;
  const api = factory(theory);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RCC = root.RCC || {}; root.RCC.song = api; }
})(typeof self !== 'undefined' ? self : this, function (theory) {
  const SECTION_RE = /^\s*\[([^\]]{1,40})\]\s*$|^\s*((?:pre-?chorus|chorus|verse|bridge|intro|outro|solo|interlude|instrumental|refrain|hook|riff|break)\b[^a-z]{0,12}[\d\w ]{0,12}):?\s*$/i;
  const clean = t => String(t || '').replace(/\r/g, '').replace(/\[\/?(ch|tab)\]/g, '');

  /* ------------------------------------------------------------------ chord sheet */
  /** @returns {{lines:Array, prog:Array<{c:string,sec:string}>}}
   *  lines[i] = {kind:'chords'|'text'|'section'|'tab', text, toks?:[{s,e,c,pi}]} */
  function parseSheet(text) {
    const out = { lines: [], prog: [] };
    let sec = '';
    clean(text).split('\n').forEach(raw => {
      const m = SECTION_RE.exec(raw);
      if (m) { sec = (m[1] || m[2]).trim(); out.lines.push({ kind: 'section', text: raw.trim() }); return; }
      if (isTabLine(raw)) { out.lines.push({ kind: 'tab', text: raw }); return; }
      const toks = [...raw.matchAll(/\S+/g)].map(x => ({ s: x.index, e: x.index + x[0].length, c: x[0] }));
      if (toks.length && toks.every(t => theory.isChord(t.c))) {
        toks.forEach(t => {
          const last = out.prog[out.prog.length - 1];
          if (!last || last.c !== t.c) out.prog.push({ c: t.c, sec });
          t.pi = out.prog.length - 1;
        });
        out.lines.push({ kind: 'chords', text: raw, toks });
      } else out.lines.push({ kind: 'text', text: raw });
    });
    return out;
  }

  /* ------------------------------------------------------------------ strumming */
  const UP = /^(u|up|↑|\^|v?↑)$/i, DOWN = /^(d|down|↓|↓)$/i;
  function mapStroke(x) {
    if (x == null || x === false) return '-';
    if (typeof x === 'object') x = x.type ?? x.direction ?? x.value ?? x.stroke ?? x.d ?? x.name ?? '';
    x = String(x).trim();
    if (!x) return '-';
    if (DOWN.test(x)) return 'D'; if (UP.test(x)) return 'U';
    const l = x[0].toLowerCase();
    if (l === 'd') return 'D'; if (l === 'u') return 'U';
    return '-';
  }
  /** "D DU UDU", "D-DU-UDU", "↓ ↑ ↓", "D - D U - U D U" -> ['D','-','D','U',…] one entry per slot. */
  function parseStrumString(str) {
    str = String(str || '').toUpperCase().replace(/↓/g, 'D').replace(/↑/g, 'U').replace(/[•·_.X]/g, '-');
    const explicitRests = /-/.test(str);
    const out = [];
    for (const ch of str) {
      if (ch === 'D' || ch === 'U') out.push(ch);
      else if (ch === '-') out.push('-');
      else if (/\s/.test(ch) && !explicitRests && out.length) out.push('-'); // UG style: a space is a rest
    }
    while (out.length && out[out.length - 1] === '-' && !explicitRests) out.pop();
    return out;
  }
  const strumToString = a => a.join('');
  const looksLikeStrum = s => s.some(x => x !== '-') && s.length >= 2 && s.length <= 32;

  function flat(v, acc = []) { if (Array.isArray(v)) v.forEach(x => flat(x, acc)); else acc.push(v); return acc; }

  /** Walk any JSON and collect objects found under keys containing "strum". */
  function findKeyDeep(obj, re, found = [], depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 12) return found;
    for (const k of Object.keys(obj)) {
      if (re.test(k) && obj[k] && typeof obj[k] === 'object') found.push(obj[k]);
      findKeyDeep(obj[k], re, found, depth + 1);
    }
    return found;
  }
  /** Extract strumming patterns from Ultimate Guitar's page store JSON (defensive: shape varies). */
  function extractStrumsFromJSON(json) {
    const res = [];
    const lists = findKeyDeep(json, /strum/i);
    for (const list of lists) {
      for (const it of flat(list)) {
        if (!it || typeof it !== 'object') continue;
        let arr = null;
        for (const k of ['values', 'strumming', 'pattern', 'strums', 'beats', 'notes', 'data', 'rhythm']) {
          if (it[k] != null) { arr = it[k]; break; }
        }
        let pat;
        if (typeof arr === 'string') pat = parseStrumString(arr);
        else if (Array.isArray(arr)) pat = flat(arr).map(mapStroke);
        else continue;
        if (!looksLikeStrum(pat)) continue;
        const den = +it.denominator || +it.subdivision || 0;
        res.push({
          part: String(it.part || it.name || it.title || it.section || '').trim(),
          pat: strumToString(pat),
          bpm: +it.bpm || 0,
          sub: it.is_triplet ? 3 : den >= 16 ? 4 : den === 8 ? 2 : den === 4 ? 1 : 0,
          src: 'ug',
        });
      }
    }
    return dedupeStrums(res);
  }
  /** Fallback: spot strumming lines in plain text ("Strumming: D DU UDU", or a line of only D/U/-). */
  function findStrumsInText(text) {
    const res = [];
    const lines = clean(text).split('\n');
    lines.forEach((l, i) => {
      let m = /strum(?:ming)?(?: pattern)?\s*[:=\-]\s*(.+)$/i.exec(l) || /^\s*pattern\s*[:=]\s*(.+)$/i.exec(l);
      let s = m && m[1];
      if (!s && /^[\sDUdu\-.x|↓↑]+$/.test(l) && /[Uu↑]/.test(l) && /[Dd↓]/.test(l) && l.trim().length >= 4) s = l;
      if (!s) return;
      const pat = parseStrumString(s.replace(/\|/g, ' '));
      if (looksLikeStrum(pat)) {
        let part = ''; for (let j = i - 1; j >= Math.max(0, i - 3); j--) { const sm = SECTION_RE.exec(lines[j]); if (sm) { part = (sm[1] || sm[2]).trim(); break; } }
        res.push({ part, pat: strumToString(pat), bpm: 0, sub: 0, src: 'text' });
      }
    });
    return dedupeStrums(res);
  }
  function dedupeStrums(a) {
    const seen = new Set();
    return a.filter(s => { const k = s.part + '|' + s.pat; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  /** Pick the pattern for a section name (falls back to the first). */
  function strumForSection(strums, sec) {
    if (!strums || !strums.length) return null;
    const s = (sec || '').toLowerCase();
    return strums.find(x => x.part && s && (s.includes(x.part.toLowerCase()) || x.part.toLowerCase().includes(s))) || strums.find(x => !x.part) || strums[0];
  }

  /* ------------------------------------------------------------------ ASCII tab */
  const TAB_LINE = /^\s*(?:[A-Ga-g][#b]?)?\s*[|:]?[-\d|hpbrxsStT\/\\~^()<>.*=vV\s]*$/;
  function isTabLine(l) {
    const t = l.trim();
    if (t.length < 8 || !/-{2,}/.test(t)) return false;
    return TAB_LINE.test(l) && /^[A-Ga-g]?[#b]?\s*[|:\-]/.test(t);
  }

  /** @returns {{sections:Array<{name:string,events:Array,bars:number[],length:number,colsPerBeat:number,minFret:number,maxFret:number}>}} */
  function parseTabs(text) {
    const lines = clean(text).split('\n');
    const groups = []; let cur = [], curStart = 0, header = '';
    const flush = () => { if (cur.length >= 6) { for (let i = 0; i + 6 <= cur.length; i += 6) groups.push({ lines: cur.slice(i, i + 6), header: cur.header }); } cur = []; };
    lines.forEach((l, i) => {
      const sm = SECTION_RE.exec(l);
      if (sm) { flush(); header = (sm[1] || sm[2]).trim(); return; }
      if (isTabLine(l)) { if (!cur.length) { curStart = i; cur.header = header; } cur.push(l); }
      else if (l.trim() === '' || !cur.length) { flush(); }
      else { flush(); }
    });
    flush();

    const sections = [];
    groups.forEach(g => {
      const blk = parseBlock(g.lines);
      let sec = sections[sections.length - 1];
      const name = g.header || '';
      if (!sec || sec.name !== name || !name) {
        sec = { name, events: [], bars: [], length: 0, colsPerBeat: 0, minFret: 99, maxFret: 0, _bw: [] };
        sections.push(sec);
      }
      blk.events.forEach(e => { sec.events.push({ ...e, t: e.t + sec.length }); e.notes.forEach(n => { sec.minFret = Math.min(sec.minFret, n.fret); sec.maxFret = Math.max(sec.maxFret, n.fret); }); });
      blk.bars.forEach(b => sec.bars.push(b + sec.length));
      if (blk.barWidth) sec._bw.push(blk.barWidth);
      sec.length += blk.width;
    });
    sections.forEach((s, i) => {
      if (!s.name) s.name = 'Tab ' + (i + 1);
      const bw = s._bw.length ? s._bw.sort((a, b) => a - b)[Math.floor(s._bw.length / 2)] : 0;
      s.colsPerBeat = bw >= 4 ? Math.max(1, Math.min(8, Math.round(bw / 4))) : 4;
      delete s._bw;
    });
    return { sections: sections.filter(s => s.events.length) };
  }

  function parseBlock(six) {
    const toks = []; let width = 0; const bars = new Set(); const widths = [];
    six.forEach((raw, s) => {
      const m = /^\s*(?:[A-Ga-g][#b]?)?\s*[|:]?/.exec(raw), line = raw.slice(m[0].length);
      width = Math.max(width, line.length);
      const re = /\d+/g; let x;
      while ((x = re.exec(line))) {
        const prev = line[x.index - 1] || '', next = line[x.index + x[0].length] || '';
        const tech = /[hp\/\\b]/.test(prev) ? prev : /[~^]/.test(next) ? '~' : '';
        toks.push({ s, fret: +x[0], start: x.index, end: x.index + x[0].length, tech });
      }
      if (s === 0) { [...line].forEach((ch, i) => { if (ch === '|' && i > 0) bars.add(i); }); }
    });
    toks.sort((a, b) => a.start - b.start || a.s - b.s);
    const events = []; let curE = null, maxEnd = -1;
    toks.forEach(t => {
      if (curE && t.start < maxEnd) { curE.notes.push({ s: t.s, fret: t.fret, tech: t.tech }); maxEnd = Math.max(maxEnd, t.end); }
      else { curE = { t: t.start, notes: [{ s: t.s, fret: t.fret, tech: t.tech }] }; events.push(curE); maxEnd = t.end; }
    });
    const bl = [...bars].sort((a, b) => a - b); const gaps = [];
    for (let i = 1; i < bl.length; i++) gaps.push(bl[i] - bl[i - 1] - 0);
    const barWidth = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] - 1 : 0;
    return { events, bars: bl, width: width + 1, barWidth };
  }

  /** Sections like "Solo", "Lead", "Riff", "Break" get flagged so the UI can list them first. */
  const isSoloName = n => /solo|lead|lick|riff|break|fill|instrumental|interlude/i.test(n);


  /* ------------------------------------------------------------------ transpose / ChordPro / stage */
  /** Rewrites every chord line of `text` up/down by `semis`, keeping the lyrics lined up. */
  function transposeText(text, semis, flats) {
    const sh = parseSheet(text);
    const firstChord = sh.prog[0] && theory.parseChord(sh.prog[0].c);
    const useFlats = flats != null ? flats : (firstChord ? theory.prefersFlats(firstChord.root + semis) : semis < 0);
    return sh.lines.map(l => {
      if (l.kind !== 'chords') return l.text;
      let out = '', at = 0, shift = 0;
      l.toks.forEach(t => {
        const nc = theory.transposeChord(t.c, semis, useFlats);
        let gap = l.text.slice(at, t.s).length - shift; if (out.length && gap < 1) gap = 1; if (gap < 0) gap = 0;
        out += ' '.repeat(gap) + nc; shift = out.length - t.e; at = t.e;
      });
      return out;
    }).join('\n');
  }

  const looksLikeChordPro = t => /\{\s*(title|t|artist|start_of_chorus|soc|start_of_verse|sov)\b/i.test(t) || [...String(t).matchAll(/\[([^\]\s]{1,10})\][A-Za-z']/g)].some(m => theory.isChord(m[1]));
  /** ChordPro ([Am]lyric inline chords + {directives}) -> chords-over-lyrics text. */
  function fromChordPro(src) {
    let title = '', artist = ''; const out = [];
    String(src).replace(/\r/g, '').split('\n').forEach(raw => {
      const d = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(raw);
      if (d) {
        const k = d[1].toLowerCase(), v = (d[2] || '').trim();
        if (k === 'title' || k === 't') title = v; else if (k === 'artist' || k === 'subtitle' || k === 'st') artist = artist || v;
        else if (k === 'start_of_chorus' || k === 'soc') out.push('[Chorus]'); else if (k === 'start_of_verse' || k === 'sov') out.push('[Verse]'); else if (k === 'start_of_bridge' || k === 'sob') out.push('[Bridge]');
        else if (/^(comment|c|comment_italic|ci)$/.test(k) && v) out.push('[' + v + ']');
        return;
      }
      if (/^\s*#/.test(raw)) return;
      if (!/\[[^\]]+\]/.test(raw)) { out.push(raw); return; }
      let lyric = '', last = 0, cl = ''; const re = /\[([^\]]+)\]/g; let m;
      while ((m = re.exec(raw))) {
        lyric += raw.slice(last, m.index); last = m.index + m[0].length;
        if (theory.isChord(m[1])) { const col = Math.max(lyric.length, cl.length ? cl.length + 1 : 0); cl = cl.padEnd(col, ' ') + m[1]; } else lyric += m[0];
      }
      lyric += raw.slice(last);
      if (cl) out.push(cl); if (lyric.trim()) out.push(lyric.replace(/\s+$/, ''));
    });
    return { title, artist, text: out.join('\n') };
  }

  /** Lines for karaoke / stage mode: [{chords:[{c,pi,col}], lyric, sec}] */
  function stageLines(sh) {
    const out = [], L = sh.lines; let sec = '';
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (l.kind === 'section') sec = l.text.replace(/[\[\]:]/g, '').trim();
      else if (l.kind === 'chords') { const nx = L[i + 1], lyr = nx && nx.kind === 'text' && nx.text.trim() ? nx.text : ''; out.push({ chords: l.toks.map(t => ({ c: t.c, pi: t.pi, col: t.s })), lyric: lyr, sec }); if (lyr) i++; }
      else if (l.kind === 'text' && l.text.trim()) out.push({ chords: [], lyric: l.text, sec });
    }
    return out;
  }
  function stageIndex(lines, pi) {
    let idx = lines.findIndex(l => l.chords.some(c => c.pi === pi));
    if (idx < 0) { for (let i = 0; i < lines.length; i++) { const p = lines[i].chords.length ? lines[i].chords[0].pi : -1; if (p >= 0 && p <= pi) idx = i; } }
    return Math.max(0, idx);
  }
  const chordNames = text => parseSheet(text).prog.map(p => p.c);

  return { transposeText, looksLikeChordPro, fromChordPro, stageLines, stageIndex, chordNames, parseSheet, parseStrumString, strumToString, extractStrumsFromJSON, findStrumsInText, strumForSection, parseTabs, isTabLine, isSoloName, clean, SECTION_RE };
});
