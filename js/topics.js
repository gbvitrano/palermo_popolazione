const AGE_BANDS = [
  { bandLabel: '0-4',   male: 'P30', female: 'P67' },
  { bandLabel: '5-9',   male: 'P31', female: 'P68' },
  { bandLabel: '10-14', male: 'P32', female: 'P69' },
  { bandLabel: '15-19', male: 'P33', female: 'P70' },
  { bandLabel: '20-24', male: 'P34', female: 'P71' },
  { bandLabel: '25-29', male: 'P35', female: 'P72' },
  { bandLabel: '30-34', male: 'P36', female: 'P73' },
  { bandLabel: '35-39', male: 'P37', female: 'P74' },
  { bandLabel: '40-44', male: 'P38', female: 'P75' },
  { bandLabel: '45-49', male: 'P39', female: 'P76' },
  { bandLabel: '50-54', male: 'P40', female: 'P77' },
  { bandLabel: '55-59', male: 'P41', female: 'P78' },
  { bandLabel: '60-64', male: 'P42', female: 'P79' },
  { bandLabel: '65-69', male: 'P43', female: 'P80' },
  { bandLabel: '70-74', male: 'P44', female: 'P81' },
  { bandLabel: '>74',   male: 'P45', female: 'P82' }
];

// Per gli stranieri il dataset ISTAT incrocia età×sesso solo su 3 fasce larghe
// (non le 16 quinquennali disponibili per la popolazione totale).
const AGE_BANDS_STRANIERI = [
  { bandLabel: '0-14',  male: 'ST25', female: 'ST28' },
  { bandLabel: '15-64', male: 'ST26', female: 'ST29' },
  { bandLabel: '65+',   male: 'ST27', female: 'ST30' }
];

// Campi delle fasce 0-14 e 65+ (indice di vecchiaia = pop. 65+ ogni 100 pop. 0-14),
// ricavati dalle stesse fasce quinquennali della piramide età-sesso.
const VECCHIAIA_UNDER_FIELDS = AGE_BANDS.slice(0, 3).flatMap(b => [b.male, b.female]);
const VECCHIAIA_OVER_FIELDS = AGE_BANDS.slice(13).flatMap(b => [b.male, b.female]);

// Ordine di visualizzazione dei gruppi nel pannello Argomenti (accordion).
export const TOPIC_GROUPS = ['Popolazione', 'Stranieri', 'Istruzione & lavoro'];

export const TOPICS = {
  popolazione_sesso: {
    group: 'Popolazione',
    label: 'Popolazione totale & sesso',
    description: 'Popolazione residente totale, maschi e femmine (ISTAT P1, P2, P3).',
    chartType: 'doughnut',
    series: [
      { field: 'P2', label: 'Maschi' },
      { field: 'P3', label: 'Femmine' }
    ],
    stranieriSeries: [
      { field: 'ST2', label: 'Maschi' },
      { field: 'ST2_B', label: 'Femmine' }
    ]
  },
  stranieri: {
    group: 'Stranieri',
    label: 'Stranieri',
    description: 'Stranieri e apolidi residenti: totale, cittadini UE ed extra-UE, e tre fasce d\'età (0–29, 30–54, 55 anni e più).',
    chartType: 'bar',
    series: [
      { field: 'ST1', label: 'Totale' },
      { field: 'ST16', label: 'UE' },
      { field: 'ST19', label: 'Extra-UE' },
      { field: 'ST3', label: 'Età 0-29' },
      { field: 'ST4', label: 'Età 30-54' },
      { field: 'ST5', label: 'Età 55+' }
    ]
  },
  stranieri_dettaglio: {
    group: 'Stranieri',
    label: 'Stranieri: età, cittadinanza e occupazione',
    description: 'Stranieri e apolidi residenti per cittadinanza UE/extra-UE e sesso, tre fasce d\'età anagrafiche (0–14, 15–64, 65+) e occupati di 15–64 anni, totali e per sesso (ISTAT ST17–ST33).',
    chartType: 'bar',
    series: [
      { field: 'ST17', label: 'UE (M)' },
      { field: 'ST18', label: 'UE (F)' },
      { field: 'ST20', label: 'Extra-UE (M)' },
      { field: 'ST21', label: 'Extra-UE (F)' },
      { field: 'ST22', label: 'Età 0-14' },
      { field: 'ST23', label: 'Età 15-64' },
      { field: 'ST24', label: 'Età 65+' },
      { field: 'ST31', label: 'Occupati totali' },
      { field: 'ST32', label: 'Occupati (M)' },
      { field: 'ST33', label: 'Occupate (F)' }
    ]
  },
  indice_vecchiaia: {
    group: 'Popolazione',
    label: 'Indice di vecchiaia',
    description: 'Popolazione di 65 anni e più ogni 100 residenti di 0-14 anni (ISTAT P30-P32, P43-P45, P67-P69, P80-P82).',
    chartType: 'index',
    underFields: VECCHIAIA_UNDER_FIELDS,
    overFields: VECCHIAIA_OVER_FIELDS
  },
  piramide_eta: {
    group: 'Popolazione',
    label: 'Piramide età-sesso',
    description: 'Popolazione residente per sesso e fasce d\'età di 5 anni, da meno di 5 a oltre 74 anni. Con il filtro stranieri: 3 fasce (0–14, 15–64, 65+).',
    chartType: 'pyramid',
    ageBands: AGE_BANDS,
    stranieriAgeBands: AGE_BANDS_STRANIERI
  },
  istruzione: {
    group: 'Istruzione & lavoro',
    label: 'Istruzione',
    description: 'Residenti di 9 anni e più per titolo di studio più alto: nessuno, licenza elementare, media, diploma (incluse le qualifiche professionali), titoli terziari.',
    chartType: 'bar',
    series: [
      { field: 'P86', label: 'Nessun titolo' },
      { field: 'P87', label: 'Elementare' },
      { field: 'P88', label: 'Media' },
      { field: 'P89', label: 'Diploma' },
      { field: 'P90', label: 'Laurea o più' }
    ]
  },
  istruzione_sesso: {
    group: 'Istruzione & lavoro',
    label: 'Istruzione per sesso',
    description: 'Stesso titolo di studio del topic "Istruzione" (residenti di 9 anni e più), diviso per maschi e femmine (ISTAT P91–P100).',
    chartType: 'bar',
    series: [
      { field: 'P91', label: 'Nessun titolo (M)' },
      { field: 'P96', label: 'Nessun titolo (F)' },
      { field: 'P92', label: 'Elementare (M)' },
      { field: 'P97', label: 'Elementare (F)' },
      { field: 'P93', label: 'Media (M)' },
      { field: 'P98', label: 'Media (F)' },
      { field: 'P94', label: 'Diploma (M)' },
      { field: 'P99', label: 'Diploma (F)' },
      { field: 'P95', label: 'Laurea o più (M)' },
      { field: 'P100', label: 'Laurea o più (F)' }
    ]
  },
  occupazione: {
    group: 'Istruzione & lavoro',
    label: 'Occupazione',
    description: 'Residenti occupati di 15–64 anni, totali e per sesso.',
    chartType: 'bar',
    series: [
      { field: 'P101', label: 'Occupati totali' },
      { field: 'P102', label: 'Occupati maschi' },
      { field: 'P103', label: 'Occupate femmine' }
    ]
  },
  nazionalita: {
    group: 'Stranieri',
    label: 'Nazionalità principali',
    description: 'Stranieri residenti per le 10 cittadinanze riportate nel dataset ISTAT per Palermo.',
    chartType: 'bar',
    series: [
      { field: 'CIT_1_BGD', label: 'Bangladesh' },
      { field: 'CIT_2_LKA', label: 'Sri Lanka' },
      { field: 'CIT_3_ROU', label: 'Romania' },
      { field: 'CIT_4_GHA', label: 'Ghana' },
      { field: 'CIT_5_PHL', label: 'Filippine' },
      { field: 'CIT_6_MAR', label: 'Marocco' },
      { field: 'CIT_7_TUN', label: 'Tunisia' },
      { field: 'CIT_8_CHN', label: 'Cina' },
      { field: 'CIT_9_MUS', label: 'Maurizio' },
      { field: 'CIT_10_NGA', label: 'Nigeria' }
    ]
  },
  famiglie: {
    group: 'Popolazione',
    label: 'Famiglie per n. componenti',
    description: 'Famiglie residenti per numero di componenti, da 1 a 6 e oltre.',
    chartType: 'bar',
    series: [
      { field: 'PF3', label: '1 componente' },
      { field: 'PF4', label: '2 componenti' },
      { field: 'PF5', label: '3 componenti' },
      { field: 'PF6', label: '4 componenti' },
      { field: 'PF7', label: '5 componenti' },
      { field: 'PF8', label: '6 e oltre' }
    ]
  },
  abitazioni: {
    group: 'Popolazione',
    label: 'Abitazioni',
    description: 'Abitazioni occupate da almeno un residente; vuote o occupate solo da non residenti; totali.',
    chartType: 'bar',
    series: [
      { field: 'A2', label: 'Occupate' },
      { field: 'A3', label: 'Vuote' },
      { field: 'A8', label: 'Totali' }
    ]
  }
};

function sumField(record, field) {
  const value = record[field];
  return typeof value === 'number' ? value : 0;
}

// Indice di vecchiaia per sezione censuaria (mappa, livello "Indice di vecchiaia"):
// stessa formula della card, calcolata sezione per sezione anziché sulla zona A/B.
export function computeVecchiaiaById(records, idField = 'SEZ21_ID') {
  const byId = new Map();
  for (const record of records) {
    const under = VECCHIAIA_UNDER_FIELDS.reduce((sum, field) => sum + sumField(record, field), 0);
    const over = VECCHIAIA_OVER_FIELDS.reduce((sum, field) => sum + sumField(record, field), 0);
    byId.set(record[idField], under > 0 ? Math.round((over / under) * 1000) / 10 : null);
  }
  return byId;
}

// Selezione delle sezioni di una zona: Map SEZ21_ID -> peso (0–1], cioè la quota della
// sezione che cade nella zona (js/dasimetria.js). Un array di id vale peso 1 per tutti
// (inclusione per centroide).
export function toWeightMap(selection) {
  return selection instanceof Map ? selection : new Map(selection.map(id => [id, 1]));
}

export function aggregateTopic(records, selection, topicKey, idField = 'SEZ21_ID', filterStranieri = false) {
  const weights = toWeightMap(selection);
  const included = records.filter(r => weights.has(r[idField]));
  const weightOf = r => weights.get(r[idField]);
  const topic = TOPICS[topicKey];
  // somme pesate arrotondate all'intero: con pesi frazionari si contano persone stimate
  const total = field => Math.round(included.reduce((sum, r) => sum + sumField(r, field) * weightOf(r), 0));

  let missingCount = 0;
  let totalPopulation = 0;
  for (const record of included) {
    if (record.P1 == null) {
      missingCount += 1;
    } else {
      totalPopulation += record.P1 * weightOf(record);
    }
  }
  totalPopulation = Math.round(totalPopulation);

  const useStranieri = filterStranieri && topicKey !== 'stranieri';

  if (topic.chartType === 'index') {
    const under = topic.underFields.reduce((sum, field) => sum + total(field), 0);
    const over = topic.overFields.reduce((sum, field) => sum + total(field), 0);
    const value = under > 0 ? Math.round((over / under) * 1000) / 10 : null;
    return {
      labels: ['Indice di vecchiaia'],
      datasets: [{ label: 'Indice di vecchiaia', data: [value ?? 0] }],
      pop0_14: under,
      pop65: over,
      indexValue: value,
      missingCount,
      totalPopulation,
      filtered: false
    };
  }

  if (topic.chartType === 'pyramid') {
    const ageBands = (useStranieri && topic.stranieriAgeBands) || topic.ageBands;
    const labels = ageBands.map(b => b.bandLabel);
    const maleData = ageBands.map(band => total(band.male));
    const femaleData = ageBands.map(band => total(band.female));
    return {
      labels,
      datasets: [
        { label: 'Maschi', data: maleData },
        { label: 'Femmine', data: femaleData }
      ],
      missingCount,
      totalPopulation,
      filtered: useStranieri && !!topic.stranieriAgeBands
    };
  }

  const series = (useStranieri && topic.stranieriSeries) || topic.series;
  const labels = series.map(s => s.label);
  const data = series.map(s => total(s.field));

  return {
    labels,
    datasets: [{ label: topic.label, data }],
    missingCount,
    totalPopulation,
    filtered: useStranieri && !!topic.stranieriSeries
  };
}

// Confronto rapido tra due aggregazioni dello stesso topic (stessa zona, anni diversi):
// somma tutti i valori di tutti i dataset per un unico totale per anno, poi variazione %.
// Nessun anno con dati (0 sezioni con SEZ21_ID presente in quell'anno) -> null (n.d.).
export function computeTrend(aggregationPrev, aggregationCurr) {
  const sumAll = agg => agg.datasets.reduce((s, ds) => s + ds.data.reduce((a, b) => a + Math.abs(b), 0), 0);
  const prevTotal = sumAll(aggregationPrev);
  const currTotal = sumAll(aggregationCurr);
  if (prevTotal === 0) {
    return { prevTotal, currTotal, pct: null, direction: currTotal === 0 ? 'flat' : 'up' };
  }
  const pct = ((currTotal - prevTotal) / prevTotal) * 100;
  const direction = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down';
  return { prevTotal, currTotal, pct, direction };
}
