// null немесе 0..3 бүтін сан — жарамды жауап мәні
export function validAnswerValue(a) {
  return a === null || (Number.isInteger(a) && a >= 0 && a <= 3);
}

// progress: {"<canonicalIndex>": optionIndex|null} — сақталған жауап ӘРҚАШАН жеңеді (анти-чит).
// clientAnswers: массив немесе undefined — тек progress-те жоқ индекстерге қолданылады.
export function mergeAnswers(total, progress, clientAnswers) {
  const out = new Array(total).fill(null);
  for (let i = 0; i < total; i++) {
    const key = String(i);
    if (progress && Object.hasOwn(progress, key)) {
      out[i] = validAnswerValue(progress[key]) ? progress[key] : null;
    } else {
      const a = Array.isArray(clientAnswers) ? clientAnswers[i] : null;
      out[i] = validAnswerValue(a) ? a : null;
    }
  }
  return out;
}
