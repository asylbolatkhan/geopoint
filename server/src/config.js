// Барлық ұпай ережелері осы жерде — өзгерту үшін тек осы файлды түзетіңіз.
export const POINTS = {
  battleWin: 20,
  battleDraw: 10,
  battleLoss: 4,
  battleCorrect: 1,          // батлдағы әр дұрыс жауап (екі жаққа да)
  battleExpiredBonus: 10,    // жауапсыз/қабылданбаған батл: ойнаған жаққа
  battleExpiredPenalty: -10, // жауапсыз/қабылданбаған батл: елемеген жаққа
  soloCorrect: 1,
  soloDailyCap: 30,          // жаттығудан күніне ең көп осынша ұпай
};

export const BATTLE = {
  expiryHours: 48,
  dailyPerOpponent: 3,
  questionSeconds: 15,
  counts: [10, 15, 20],
  teacherChallengeTopN: 3, // оқушы мұғалімге тек алдыңғы айдың топ-3-інде болса ғана батл тастай алады
};

export const TIMEZONE = 'Asia/Almaty';
