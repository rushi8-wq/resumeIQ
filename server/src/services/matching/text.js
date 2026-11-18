import { canonicalizeSkillTerms } from '../parsing/structured.js';
const stopWords = new Set(
  'a an the and or to of in on with for at by from as is are be been being was were this that these those you your we our they their it its will can should must required preferred experience years year skills ability have has work using use including strong knowledge proficiency'.split(
    ' ',
  ),
);
export function tokens(text) {
  return (
    canonicalizeSkillTerms(text)
      .toLowerCase()
      .match(/\.net|c\+\+|c#|[\p{L}\p{N}]+(?:[./-][\p{L}\p{N}]+)*/gu) || []
  ).filter((t) => !stopWords.has(t));
}
export function cosine(a, b) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? Math.max(0, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
}
export function tfidfSimilarity(first, second) {
  const docs = [tokens(first), tokens(second)];
  if (!docs[0].length || !docs[1].length) return 0;
  const terms = [...new Set(docs.flat())].sort();
  const counts = docs.map((doc) => {
    const map = new Map();
    for (const t of doc) map.set(t, (map.get(t) || 0) + 1);
    return map;
  });
  const vectors = counts.map((count, i) =>
    terms.map((term) => {
      const df = counts.filter((c) => c.has(term)).length;
      return (
        ((count.get(term) || 0) / docs[i].length) * (Math.log(3 / (1 + df)) + 1)
      );
    }),
  );
  return cosine(...vectors);
}
export function hasPositiveMention(text, skill) {
  // Explicit negations do not constitute evidence. Bare skills in the saved skills array remain user-editable claims.
  const canonical = canonicalizeSkillTerms(text)
    .toLowerCase()
    .replace(/\bno-/g, 'no ');
  const term = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return !new RegExp(
    `(?:no|without|lack(?:ing)?|not familiar with|no experience (?:with|in))\\s+(?:\\w+\\s+){0,2}${term}`,
    'i',
  ).test(canonical);
}
export const round = (value) => Math.round(value * 100) / 100;
