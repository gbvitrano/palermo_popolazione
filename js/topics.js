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

export const TOPICS = {
  popolazione_sesso: {
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
  piramide_eta: {
    label: 'Piramide età-sesso',
    description: 'Popolazione residente per sesso e fasce d\'età di 5 anni, da meno di 5 a oltre 74 anni. Con il filtro stranieri: 3 fasce (0–14, 15–64, 65+).',
    chartType: 'pyramid',
    ageBands: AGE_BANDS,
    stranieriAgeBands: AGE_BANDS_STRANIERI
  },
  istruzione: {
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
  occupazione: {
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

export function aggregateTopic(records, sectionIds, topicKey, idField = 'SEZ21_ID', filterStranieri = false) {
  const idSet = new Set(sectionIds);
  const included = records.filter(r => idSet.has(r[idField]));
  const topic = TOPICS[topicKey];

  let missingCount = 0;
  let totalPopulation = 0;
  for (const record of included) {
    if (record.P1 == null) {
      missingCount += 1;
    } else {
      totalPopulation += record.P1;
    }
  }

  const useStranieri = filterStranieri && topicKey !== 'stranieri';

  if (topic.chartType === 'pyramid') {
    const ageBands = (useStranieri && topic.stranieriAgeBands) || topic.ageBands;
    const labels = ageBands.map(b => b.bandLabel);
    const maleData = ageBands.map(band =>
      included.reduce((sum, r) => sum + sumField(r, band.male), 0)
    );
    const femaleData = ageBands.map(band =>
      included.reduce((sum, r) => sum + sumField(r, band.female), 0)
    );
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
  const data = series.map(s =>
    included.reduce((sum, r) => sum + sumField(r, s.field), 0)
  );

  return {
    labels,
    datasets: [{ label: topic.label, data }],
    missingCount,
    totalPopulation,
    filtered: useStranieri && !!topic.stranieriSeries
  };
}
