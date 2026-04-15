import { countries as europeCountries } from '../data/europe';
import { asianCountries } from '../data/asia';
import { northAmericanCountries } from '../data/northamerica';
import { southAmericanCountries } from '../data/southamerica';
import { africanCountries } from '../data/africa';
import { oceaniaCountries } from '../data/oceania';

const CONTINENT_MAP = {
  europe:       europeCountries,
  asia:         asianCountries,
  northamerica: northAmericanCountries,
  southamerica: southAmericanCountries,
  africa:       africanCountries,
  oceania:      oceaniaCountries,
};

const CONTINENT_NAMES = {
  europe:       { kk: 'Еуропа',        ru: 'Европа'          },
  asia:         { kk: 'Азия',          ru: 'Азия'            },
  northamerica: { kk: 'Солт. Америка', ru: 'Сев. Америка'    },
  southamerica: { kk: 'Оңт. Америка',  ru: 'Юж. Америка'     },
  africa:       { kk: 'Африка',        ru: 'Африка'          },
  oceania:      { kk: 'Океания',       ru: 'Океания'         },
};

export function printStudySheet(language, continents = ['europe']) {
  const isKk = language === 'kk';
  const selected = Array.isArray(continents) ? continents : [continents];

  const allCountries = selected.flatMap(k => CONTINENT_MAP[k] ?? []);
  const continentLabel = selected.map(k => CONTINENT_NAMES[k]?.[language] ?? k).join(' + ');
  const title = isKk
    ? `${continentLabel} елдері — Дайындық парағы`
    : `Страны: ${continentLabel} — Шпаргалка`;
  const subtitle = isKk
    ? `${allCountries.length} мемлекет · ${continentLabel}`
    : `${allCountries.length} государств · ${continentLabel}`;

  const colCountry = isKk ? 'Ел атауы' : 'Страна';
  const colCapital = isKk ? 'Астана'   : 'Столица';
  const colFlag    = isKk ? 'Ту'       : 'Флаг';

  const rows = allCountries
    .slice()
    .sort((a, b) => a.name[language].localeCompare(b.name[language]))
    .map((c, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="flag-cell">
          <img src="https://flagcdn.com/w80/${c.id}.png" alt="${c.id}" />
        </td>
        <td class="country">${c.name[language]}</td>
        <td class="capital">${c.capital[language]}</td>
      </tr>
    `).join('');

  const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #fff;
    color: #1e293b;
    padding: 24px 28px;
  }
  header {
    text-align: center;
    margin-bottom: 20px;
    padding-bottom: 14px;
    border-bottom: 2px solid #3b82f6;
  }
  header h1 {
    font-size: 20px;
    font-weight: 900;
    color: #1d4ed8;
    letter-spacing: -0.3px;
  }
  header p {
    font-size: 12px;
    color: #64748b;
    margin-top: 3px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  thead th {
    background: #1d4ed8;
    color: #fff;
    font-weight: 700;
    padding: 7px 8px;
    text-align: left;
  }
  thead th.num { width: 28px; text-align: center; }
  thead th.flag-cell { width: 56px; text-align: center; }
  tbody tr:nth-child(even) { background: #f1f5f9; }
  td {
    padding: 5px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
  }
  td.num { text-align: center; color: #94a3b8; font-size: 11px; }
  td.flag-cell { text-align: center; padding: 4px 6px; }
  td.flag-cell img {
    height: 28px;
    width: auto;
    border-radius: 2px;
    border: 1px solid #e2e8f0;
    display: block;
    margin: 0 auto;
  }
  td.country { font-weight: 700; color: #1e293b; }
  td.capital { color: #475569; }
  footer {
    margin-top: 16px;
    text-align: center;
    font-size: 10px;
    color: #94a3b8;
  }
  @media print {
    body { padding: 12px 16px; }
    @page { margin: 10mm 12mm; size: A4 portrait; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <p>${subtitle}</p>
</header>
<table>
  <thead>
    <tr>
      <th class="num">#</th>
      <th class="flag-cell">${colFlag}</th>
      <th>${colCountry}</th>
      <th>${colCapital}</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
<footer>GeoVictorina · ${new Date().getFullYear()}</footer>
<script>
  window.onload = function() {
    const imgs = document.querySelectorAll('img');
    let loaded = 0;
    if (imgs.length === 0) { window.print(); return; }
    imgs.forEach(img => {
      if (img.complete) { loaded++; if (loaded === imgs.length) window.print(); }
      else {
        img.onload = img.onerror = () => { loaded++; if (loaded === imgs.length) window.print(); };
      }
    });
  };
<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
