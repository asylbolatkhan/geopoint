import { shuffle } from './shuffle';

function getAnswer(country, type, language) {
  if (type === 'flag-country' || type === 'capital-country') {
    return country.name[language];
  }
  if (type === 'country-flag' || type === 'capital-flag') {
    return country.id; // ISO code — flag image key
  }
  return country.capital[language];
}

function getQuestionDisplay(country, type, language) {
  if (type === 'flag-country' || type === 'flag-capital') {
    return { displayType: 'flag', value: country.id };
  }
  if (type === 'country-capital') {
    return { displayType: 'text', value: country.name[language] };
  }
  if (type === 'country-flag') {
    return { displayType: 'text', value: country.name[language] };
  }
  if (type === 'capital-flag') {
    return { displayType: 'text', value: country.capital[language] };
  }
  return { displayType: 'text', value: country.capital[language] };
}

export function generateQuiz(config, allCountries, language) {
  const { questionTypes, questionCount } = config;

  // Shuffle countries — random order every quiz start
  const shuffled = shuffle(allCountries);
  const count = questionCount === 'all'
    ? shuffled.length
    : Math.min(questionCount, shuffled.length);
  const selected = shuffled.slice(0, count);

  return selected.map(country => {
    const type = questionTypes[Math.floor(Math.random() * questionTypes.length)];
    const correctAnswer = getAnswer(country, type, language);

    // Build wrong answer pool
    const pool = allCountries
      .filter(c => c.id !== country.id)
      .map(c => getAnswer(c, type, language));

    const unique = [...new Set(pool)];
    // Return wrongAnswers separately so each PlayerPanel can shuffle options independently
    const wrongAnswers = shuffle(unique).slice(0, 3);

    return {
      country,
      type,
      question: getQuestionDisplay(country, type, language),
      correctAnswer,
      wrongAnswers,
    };
  });
}
