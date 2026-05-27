/*
 * GradientComparison.js
 *
 * PixInsight 1.9.4+ feature script.
 *
 * Given a target image (mono or color/combined channels) and a chosen
 * telescope setup, this script:
 *
 *   1. Clones the target so the ORIGINAL is never modified.
 *   2. Runs SpectrophotometricFluxCalibration (SPFC) on the clone -- this
 *      is the prerequisite for MultiscaleGradientCorrection. It uses the
 *      chosen setup's sensor QE curve and filter parameters (broadband
 *      filter brand for LRGB / RGB, or narrowband wavelength and bandwidth
 *      for SHO, HOO, etc.). For mono images SPFC is run in single-channel
 *      mode using the FITS FILTER keyword.
 *   3. Runs three gradient-removal processes -- GradientCorrection (GC),
 *      MultiscaleGradientCorrection (MGC), and AutomaticBackgroundExtraction
 *      (ABE) -- on independent clones of the SPFC-calibrated image, and
 *      keeps both the corrected image and the gradient/background model
 *      from each. Six output windows in total.
 *
 * Suffix scheme:
 *   <id>_GC,  <id>_GC_bg
 *   <id>_MGC, <id>_MGC_bg
 *   <id>_ABE, <id>_ABE_bg
 *
 * Output windows are NOT saved to disk -- they remain open in PixInsight.
 *
 * For mono images, the filter is auto-detected from the FILTER FITS
 * keyword (no UI override). For color images, the palette is parsed from
 * the image name (SHO, HOO, HSO, OHS, HOS, LRGB, RGB); if none is found,
 * pick one from the dropdown before running.
 *
 * Telescope setup table, filter brand curves, and narrowband bandwidth
 * are defined near the top of this file -- edit them if your SPFC
 * curve database uses slightly different names.
 *
 * V8 / PixInsight 1.9.4 compatible -- no SpiderMonkey-only idioms.
 */
#engine v8
#feature-id CustomGradientCorrect : EGo > Multi Gradient Comparison
#feature-info  Runs SPFC then GradientCorrection, MultiscaleGradientCorrection, \
   and AutomaticBackgroundExtraction on a target image, leaving the \
   original untouched and producing six output windows (corrected + \
   gradient/background for each process). Uses telescope-setup-specific \
   sensor QE and filter parameters.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "1.0.0"
#define TITLE   "Gradient Comparison"

// ===========================================================================
// Telescope setups
// ===========================================================================
// `sensorQE` is the SPFC device QE curve name (must match an entry in your
// SPFC sensor database -- PI groups them by the underlying sensor chip,
// not the camera brand). `lrgbBrand` and `narrowbandBrand` index into the
// FILTER_CURVES table below. `narrowbandBandwidth` is in nm and is used in
// SPFC narrowband mode and as the bandwidth for mono narrowband MGC.
//
//   Sensor chip mapping:
//     QHY 600 CMOS   -> Sony  IMX 455
//     ASI 2600MM     -> Sony  IMX 571
//     FLI ML16200    -> Kodak KAF 16200
//     FLI ML16803    -> Kodak KAF 16803

// `sensorQE` MUST match a key in QE_CURVES (below) -- these names are also
// the strings that go into SPFC's deviceQECurveName parameter.
var SETUPS = {
   "Chile PW17": {
      sensorQE:            "Sony IMX411/455/461/533/571",
      lrgbBrand:           "Chroma",
      narrowbandBrand:     "Chroma",
      narrowbandBandwidth: 8.0
   },
   "New Mexico PW17": {
      sensorQE:            "Sony IMX411/455/461/533/571",
      lrgbBrand:           "Chroma",
      narrowbandBrand:     "Chroma",
      narrowbandBandwidth: 8.0
   },
   "Astro-Physics RH-305": {
      sensorQE:            "KAF-16200",
      lrgbBrand:           "Astrodon",
      narrowbandBrand:     "Astrodon",
      narrowbandBandwidth: 5.0
   },
   "Astro-Physics AP-175": {
      sensorQE:            "KAF-16803",
      lrgbBrand:           "Astrodon",
      narrowbandBrand:     "Astrodon",
      narrowbandBandwidth: 5.0
   },
   "Takahashi TOA-150": {
      sensorQE:            "KAF-16200",
      lrgbBrand:           "Chroma",
      narrowbandBrand:     "Chroma",
      narrowbandBandwidth: 8.0
   },
   "Home": {
      sensorQE:            "Sony IMX411/455/461/533/571",
      lrgbBrand:           "Optolong",
      narrowbandBrand:     "Antlia",
      narrowbandBandwidth: 4.5
   }
};

var SETUP_ORDER = [
   "Chile PW17",
   "New Mexico PW17",
   "Astro-Physics RH-305",
   "Astro-Physics AP-175",
   "Takahashi TOA-150",
   "Home"
];

// SPFC broadband filter curve database names per brand. These match the
// dropdown entries in PixInsight's SPFC/SPCC filter database.
var FILTER_CURVES = {
   "Chroma": {
      L: "Chroma L",
      R: "Chroma R",
      G: "Chroma G",
      B: "Chroma B"
   },
   "Astrodon": {
      L: "Astrodon E-series L",
      R: "Astrodon E-series R",
      G: "Astrodon E-series G",
      B: "Astrodon E-series B"
   },
   "Optolong": {
      L: "Optolong L",
      R: "Optolong R",
      G: "Optolong G",
      B: "Optolong B"
   }
};

// ===========================================================================
// SPFC raw CSV curve data
// ===========================================================================
// SPFC's *Curve parameters (deviceQECurve, grayFilterTrCurve, redFilterTrCurve,
// ...) expect raw CSV data of "wavelength_nm,response" pairs. Names alone
// don't trigger a database lookup from JavaScript, so we embed the CSVs here.
// Extracted from the PixInsight SPFC GUI (open SPFC, pick the curve from the
// dropdown, save process icon as a JS file -- the CSV is the value assigned
// to the *Curve parameter).
var QE_CURVES = {
   "KAF-16200": "400,0.3756,402,0.3799,404,0.382,406,0.3863,408,0.3863,410,0.3905,412,0.3927,414,0.3927,416,0.397,418,0.3991,420,0.4012,422,0.4055,424,0.4076,426,0.414,428,0.4183,430,0.4204,432,0.4247,434,0.4268,436,0.4332,438,0.4375,440,0.4396,442,0.4418,444,0.4418,446,0.4439,448,0.446,450,0.446,452,0.4482,454,0.4503,456,0.4524,458,0.4524,460,0.4546,462,0.4567,464,0.461,466,0.4652,468,0.4674,470,0.4716,472,0.4738,474,0.4759,476,0.4802,478,0.4845,480,0.4866,482,0.493,484,0.4994,486,0.5037,488,0.5101,490,0.5143,492,0.5207,494,0.525,496,0.5314,498,0.5357,500,0.5399,502,0.5442,504,0.5442,506,0.5463,508,0.5485,510,0.5506,512,0.5527,514,0.5549,516,0.5591,518,0.5591,520,0.5634,522,0.5655,524,0.5677,526,0.572,528,0.5741,530,0.5762,532,0.5784,534,0.5826,536,0.5848,538,0.5869,540,0.589,542,0.589,544,0.5869,546,0.5869,548,0.5869,550,0.5848,552,0.5848,554,0.5848,556,0.5848,558,0.5848,560,0.5826,562,0.5805,564,0.5762,566,0.572,568,0.5698,570,0.5655,572,0.5613,574,0.5591,576,0.5549,578,0.5527,580,0.5506,582,0.5506,584,0.5506,586,0.5506,588,0.5506,590,0.5506,592,0.5506,594,0.5506,596,0.5485,598,0.5485,600,0.5485,602,0.5485,604,0.5485,606,0.5463,608,0.5442,610,0.5442,612,0.5421,614,0.5421,616,0.5399,618,0.5399,620,0.5378,622,0.5314,624,0.5293,626,0.5229,628,0.5165,630,0.5122,632,0.5079,634,0.5015,636,0.4973,638,0.493,640,0.4887,642,0.4887,644,0.4866,646,0.4823,648,0.4823,650,0.4802,652,0.478,654,0.4759,656,0.4738,658,0.4716,660,0.4695,662,0.4652,664,0.4631,666,0.4588,668,0.4546,670,0.4524,672,0.4503,674,0.446,676,0.4439,678,0.4396,680,0.4375,682,0.4354,684,0.4354,686,0.4311,688,0.4311,690,0.429,692,0.4268,694,0.4247,696,0.4226,698,0.4204,700,0.4183,702,0.4162,704,0.4119,706,0.4098,708,0.4055,710,0.4034,712,0.4012,714,0.397,716,0.3948,718,0.3905,720,0.3884,722,0.3863,724,0.382,726,0.3799,728,0.3756,730,0.3735,732,0.3713,734,0.3671,736,0.3649,738,0.3607,740,0.3585,742,0.3564,744,0.3564,746,0.3521,748,0.3521,750,0.35,752,0.3479,754,0.3457,756,0.3436,758,0.3415,760,0.3393,762,0.3372,764,0.3372,766,0.3329,768,0.3308,770,0.3287,772,0.3265,774,0.3265,776,0.3244,778,0.3223,780,0.3201,782,0.3159,784,0.3137,786,0.3095,788,0.3073,790,0.3052,792,0.3009,794,0.2988,796,0.2945,798,0.2902,800,0.2881,802,0.286,804,0.286,806,0.2817,808,0.2817,810,0.2796,812,0.2774,814,0.2753,816,0.2732,818,0.271,820,0.2689,822,0.2668,824,0.2646,826,0.2604,828,0.2561,830,0.254,832,0.2518,834,0.2497,836,0.2454,838,0.2412,840,0.239,842,0.239,844,0.2369,846,0.2369,848,0.2348,850,0.2348,852,0.2326,854,0.2326,856,0.2305,858,0.2305,860,0.2284,862,0.2241,864,0.2198,866,0.2113,868,0.207,870,0.2006,872,0.1985,874,0.1921,876,0.1857,878,0.1814,880,0.1771,882,0.1729,884,0.1707,886,0.1643,888,0.1622,890,0.1579,892,0.1537,894,0.1494,896,0.1451,898,0.143,900,0.1387,902,0.1366,904,0.1323,906,0.1302,908,0.1259,910,0.1238,912,0.1216,914,0.1174,916,0.1152,918,0.111,920,0.1088,922,0.1067,924,0.1046,926,0.1003,928,0.1003,930,0.096,932,0.0939,934,0.0918,936,0.0896,938,0.0875,940,0.0854,942,0.0832,944,0.0811,946,0.079,948,0.0768,950,0.0747,952,0.0726,954,0.0704,956,0.0683,958,0.0662,960,0.064,962,0.064,964,0.0619,966,0.0598,968,0.0576,970,0.0555,972,0.0555,974,0.0534,976,0.0512,978,0.0491,980,0.047,982,0.047,984,0.0458,986,0.044,988,0.0428,990,0.0416,992,0.0404,994,0.0392,996,0.0375,998,0.0363",
   "KAF-16803": "360,0.2393,362,0.2464,364,0.2536,366,0.2643,368,0.2714,370,0.2857,372,0.3071,374,0.325,376,0.3393,378,0.3679,380,0.375,382,0.3786,384,0.3786,386,0.3821,388,0.3857,390,0.3893,392,0.3929,394,0.4,396,0.4,398,0.4071,400,0.4143,402,0.4214,404,0.425,406,0.4321,408,0.4357,410,0.4357,412,0.4357,414,0.4321,416,0.4321,418,0.4286,420,0.4286,422,0.4321,424,0.4321,426,0.4321,428,0.4357,430,0.4393,432,0.4393,434,0.4429,436,0.4464,438,0.4464,440,0.4429,442,0.4429,444,0.4393,446,0.4357,448,0.4357,450,0.4321,452,0.4321,454,0.4321,456,0.4357,458,0.4393,460,0.4429,462,0.45,464,0.4571,466,0.4643,468,0.475,470,0.4821,472,0.4929,474,0.5,476,0.5107,478,0.5179,480,0.5214,482,0.525,484,0.5286,486,0.5321,488,0.5357,490,0.5357,492,0.5393,494,0.5429,496,0.5429,498,0.55,500,0.5571,502,0.5643,504,0.5679,506,0.5714,508,0.575,510,0.5821,512,0.5857,514,0.5857,516,0.5857,518,0.5893,520,0.5893,522,0.5893,524,0.5893,526,0.5857,528,0.5893,530,0.5893,532,0.5893,534,0.5893,536,0.5893,538,0.5893,540,0.5929,542,0.5964,544,0.5964,546,0.5964,548,0.5929,550,0.5929,552,0.5893,554,0.5857,556,0.5893,558,0.5893,560,0.5893,562,0.5893,564,0.5857,566,0.5893,568,0.5893,570,0.5893,572,0.5893,574,0.5857,576,0.5857,578,0.5836,580,0.5814,582,0.5793,584,0.5771,586,0.575,588,0.5643,590,0.5571,592,0.55,594,0.55,596,0.5464,598,0.5464,600,0.5464,602,0.5464,604,0.5464,606,0.5393,608,0.5357,610,0.5321,612,0.5286,614,0.525,616,0.5214,618,0.5179,620,0.5179,622,0.5143,624,0.5143,626,0.5107,628,0.5107,630,0.5107,632,0.5071,634,0.5,636,0.4929,638,0.4857,640,0.4786,642,0.475,644,0.4679,646,0.4607,648,0.4571,650,0.4536,652,0.4464,654,0.4429,656,0.4393,658,0.4357,660,0.4321,662,0.4286,664,0.4286,666,0.4271,668,0.4243,670,0.4214,672,0.4186,674,0.4157,676,0.4114,678,0.4086,680,0.4036,682,0.4071,684,0.4071,686,0.4107,688,0.4143,690,0.4143,692,0.4107,694,0.4107,696,0.4071,698,0.4036,700,0.4036,702,0.4036,704,0.4071,706,0.4071,708,0.4071,710,0.4036,712,0.4,714,0.3964,716,0.3893,718,0.3821,720,0.3786,722,0.3786,724,0.3786,726,0.3786,728,0.3786,730,0.3786,732,0.3679,734,0.3643,736,0.3571,738,0.3536,740,0.3464,742,0.3464,744,0.3464,746,0.3429,748,0.3429,750,0.3464,752,0.3464,754,0.35,756,0.35,758,0.3536,760,0.3464,762,0.3429,764,0.3357,766,0.3286,768,0.325,770,0.325,772,0.325,774,0.325,776,0.3286,778,0.3286,780,0.325,782,0.325,784,0.3203,786,0.3181,788,0.3148,790,0.3126,792,0.3104,794,0.3082,796,0.306,798,0.3027,800,0.3005,802,0.2984,804,0.2962,806,0.294,808,0.2929,810,0.2821,812,0.2786,814,0.2714,816,0.2679,818,0.2607,820,0.2571,822,0.25,824,0.25,826,0.2464,828,0.2429,830,0.2393,832,0.2357,834,0.2357,836,0.2321,838,0.2321,840,0.2286,842,0.2214,844,0.2179,846,0.2146,848,0.2114,850,0.2081,852,0.2049,854,0.2,856,0.1964,858,0.1964,860,0.1929,862,0.1929,864,0.1893,866,0.1893,868,0.1857,870,0.1821,872,0.1786,874,0.1786,876,0.1714,878,0.1679,880,0.1607,882,0.1571,884,0.1536,886,0.15,888,0.1464,890,0.1429,892,0.1429,894,0.1393,896,0.1393,898,0.1357,900,0.1357,902,0.1357,904,0.1357,906,0.1321,908,0.1286,910,0.125,912,0.1214,914,0.1179,916,0.1179,918,0.1143,920,0.1107,922,0.1071,924,0.1036,926,0.1036,928,0.1,930,0.1,932,0.0964,934,0.0929,936,0.0929,938,0.0893,940,0.0893,942,0.0857,944,0.0821,946,0.0786,948,0.075,950,0.0714,952,0.0679,954,0.0643,956,0.0607,958,0.0607,960,0.0571,962,0.0571,964,0.0536,966,0.05,968,0.05,970,0.0464,972,0.0464,974,0.0429,976,0.0429,978,0.0429,980,0.0429,982,0.0393,984,0.0393,986,0.0357,988,0.0321,990,0.0321,992,0.0286,994,0.0286,996,0.025,998,0.025,1000,0.0214,1002,0.0214,1004,0.0179,1006,0.0179,1008,0.0179,1010,0.0179,1012,0.0179,1014,0.0179,1016,0.0143,1018,0.0143,1020,0.0143,1022,0.0143,1024,0.0143,1026,0.0107,1028,0.0107,1030,0.0107,1032,0.0107,1034,0.0071,1036,0.0071,1038,0.0071,1040,0.0036,1042,0.0036,1044,0.0036",
   "Sony IMX411/455/461/533/571": "402,0.7219,404,0.7367,406,0.75,408,0.7618,410,0.7751,412,0.787,414,0.7944,416,0.8018,418,0.8112,420,0.8214,422,0.8343,424,0.8462,426,0.8536,428,0.8595,430,0.8639,432,0.8713,434,0.8757,436,0.8802,438,0.8861,440,0.8905,442,0.895,444,0.8994,446,0.9038,448,0.9068,450,0.9112,452,0.9142,454,0.9172,456,0.9168,458,0.9151,460,0.9134,462,0.9117,464,0.91,466,0.9083,468,0.9066,470,0.9049,472,0.9032,474,0.9015,476,0.8997,478,0.898,480,0.8963,482,0.8946,484,0.8929,486,0.8912,488,0.8876,490,0.8846,492,0.8877,494,0.8904,496,0.893,498,0.8964,500,0.8964,502,0.895,504,0.8945,506,0.8922,508,0.8899,510,0.8876,512,0.8853,514,0.883,516,0.8807,518,0.8784,520,0.8761,522,0.8743,524,0.8728,526,0.8698,528,0.8669,530,0.8624,532,0.858,534,0.855,536,0.8506,538,0.8476,540,0.8432,542,0.8402,544,0.8358,546,0.8328,548,0.8284,550,0.8254,552,0.821,554,0.8166,556,0.8136,558,0.8092,560,0.8062,562,0.8023,564,0.7983,566,0.7944,568,0.7899,570,0.787,572,0.7825,574,0.7781,576,0.7751,578,0.7707,580,0.7663,582,0.7618,584,0.7559,586,0.75,588,0.7441,590,0.7396,592,0.7337,594,0.7278,596,0.7219,598,0.716,600,0.7101,602,0.7056,604,0.6997,606,0.695,608,0.6905,610,0.6852,612,0.6808,614,0.6763,616,0.6719,618,0.6675,620,0.663,622,0.6583,624,0.6553,626,0.6509,628,0.6464,630,0.642,632,0.6376,634,0.6317,636,0.6272,638,0.6213,640,0.6154,642,0.6109,644,0.6036,646,0.5962,648,0.5902,650,0.5843,652,0.5799,654,0.574,656,0.5695,658,0.5636,660,0.5592,662,0.5545,664,0.5504,666,0.5462,668,0.542,670,0.5378,672,0.5328,674,0.5286,676,0.5244,678,0.5203,680,0.5163,682,0.5133,684,0.5089,686,0.5044,688,0.4985,690,0.4926,692,0.4867,694,0.4793,696,0.4719,698,0.4645,700,0.4586,702,0.4541,704,0.4497,706,0.4453,708,0.4408,710,0.4364,712,0.432,714,0.4275,716,0.4216,718,0.4186,720,0.4142,722,0.4127,724,0.4103,726,0.4078,728,0.4053,730,0.4024,732,0.3979,734,0.3935,736,0.3891,738,0.3831,740,0.3802,742,0.3772,744,0.3743,746,0.3713,748,0.3669,750,0.3624,752,0.3595,754,0.3559,756,0.3526,758,0.3494,760,0.3462,762,0.3429,764,0.3397,766,0.3364,768,0.3332,770,0.33,772,0.3267,774,0.3235,776,0.3203,778,0.317,780,0.3138,782,0.3106,784,0.3073,786,0.3041,788,0.3009,790,0.2976,792,0.2937,794,0.2905,796,0.2873,798,0.284,800,0.2808,802,0.2776,804,0.2743,806,0.2731,808,0.2703,810,0.2674,812,0.2646,814,0.2618,816,0.2589,818,0.2561,820,0.2533,822,0.2504,824,0.2476,826,0.2456,828,0.2439,830,0.2433,832,0.2427,834,0.2421,836,0.2416,838,0.2411,840,0.2382,842,0.2322,844,0.2278,846,0.2219,848,0.2175,850,0.2114,852,0.2069,854,0.2023,856,0.1978,858,0.1932,860,0.1918,862,0.1911,864,0.1904,866,0.1897,868,0.189,870,0.1883,872,0.1879,874,0.1834,876,0.179,878,0.1731,880,0.1672,882,0.1612,884,0.1568,886,0.1524,888,0.1479,890,0.1464,892,0.1464,894,0.1464,896,0.1464,898,0.1481,900,0.1494,902,0.1494,904,0.1494,906,0.1464,908,0.1435,910,0.1391,912,0.1346,914,0.1302,916,0.1257,918,0.1228,920,0.1183,922,0.1139,924,0.1109,926,0.1093,928,0.1085,930,0.108,932,0.108,934,0.108,936,0.108,938,0.108,940,0.1058,942,0.1039,944,0.1021,946,0.0998,948,0.0958,950,0.0918,952,0.0888,954,0.0828,956,0.0769,958,0.074,960,0.0714,962,0.0695,964,0.0677,966,0.0658,968,0.0651,970,0.0636,972,0.0626,974,0.0616,976,0.0606,978,0.0596,980,0.0586,982,0.0576,984,0.0567,986,0.0557,988,0.0547,990,0.0537,992,0.0527,994,0.0517,996,0.0507"
};

var FILTER_TR_CURVES = {
   "Astrodon E-series R": "576,0.007,578,0.012,580,0.019,582,0.025,584,0.033,586,0.04,588,0.047,590,0.054,592,0.06,594,0.067,596,0.073,598,0.079,600,0.085,602,0.092,604,0.099,606,0.108,608,0.118,610,0.129,612,0.144,614,0.162,616,0.196,618,0.252,620,0.31,622,0.37,624,0.43,626,0.492,628,0.554,630,0.618,632,0.683,634,0.748,636,0.815,638,0.883,640,0.952,642,0.96,644,0.97,646,0.97,648,0.98,650,0.98,652,0.98,654,0.98,656,0.98,658,0.97,660,0.96,662,0.96,664,0.96,666,0.95,668,0.94,670,0.93,672,0.89,674,0.85,676,0.807,678,0.767,680,0.719,682,0.664,684,0.605,686,0.543,688,0.479,690,0.414,692,0.352,694,0.292,696,0.236,698,0.187,700,0.145,702,0.113,704,0.083,706,0.059,708,0.041,710,0.03,712,0.028,714,0.027,716,0.026,718,0.025,720,0.024,722,0.023,724,0.022,726,0.021,728,0.02,730,0.019,732,0.018,734,0.017,736,0.016,738,0.015,740,0.014,742,0.012,744,0.011,746,0.01,748,0.009,750,0.008",
   "Astrodon E-series G": "492,0.01,494,0.072,496,0.47,498,0.81,500,0.82,502,0.83,504,0.84,506,0.91,508,0.94,510,0.97,512,0.97,514,0.97,516,0.97,518,0.97,520,0.98,522,0.98,524,0.98,526,0.98,528,0.98,530,0.98,532,0.98,534,0.98,536,0.973,538,0.951,540,0.92,542,0.879,544,0.829,546,0.779,548,0.742,550,0.704,552,0.665,554,0.625,556,0.583,558,0.539,560,0.495,562,0.449,564,0.402,566,0.353,568,0.304,570,0.253,572,0.216,574,0.192,576,0.17,578,0.149,580,0.129,582,0.111,584,0.094,586,0.079,588,0.065,590,0.053,592,0.042,594,0.033,596,0.025,598,0.018,600,0.013",
   "Astrodon E-series B": "386,0.01,388,0.048,390,0.151,392,0.291,394,0.45,396,0.614,398,0.767,400,0.891,402,0.972,404,0.98,406,0.98,408,0.98,410,0.98,412,0.98,414,0.99,416,0.99,418,0.99,420,0.99,422,0.99,424,0.99,426,0.99,428,0.99,430,0.99,432,0.99,434,0.99,436,0.99,438,0.99,440,0.99,442,0.99,444,0.99,446,0.99,448,0.99,450,0.99,452,0.99,454,0.99,456,0.99,458,0.99,460,0.99,462,0.99,464,0.99,466,0.99,468,0.99,470,0.99,472,0.99,474,0.99,476,0.99,478,0.99,480,0.99,482,0.99,484,0.98,486,0.98,488,0.97,490,0.97,492,0.89,494,0.81,496,0.79,498,0.81,500,0.83,502,0.794,504,0.71,506,0.578,508,0.398,510,0.17,512,0.114,514,0.068,516,0.034,518,0.012",
   "Chroma R": "578,0.012,580,0.017,582,0.025,584,0.038,586,0.058,588,0.089,590,0.14,592,0.222,594,0.346,596,0.515,598,0.702,600,0.854,602,0.94,604,0.975,606,0.979,608,0.977,610,0.975,612,0.975,614,0.978,616,0.978,618,0.98,620,0.977,622,0.976,624,0.975,626,0.976,628,0.978,630,0.981,632,0.983,634,0.985,636,0.985,638,0.985,640,0.982,642,0.98,644,0.976,646,0.975,648,0.972,650,0.974,652,0.978,654,0.98,656,0.982,658,0.979,660,0.977,662,0.976,664,0.977,666,0.975,668,0.979,670,0.98,672,0.977,674,0.976,676,0.977,678,0.979,680,0.981,682,0.981,684,0.979,686,0.978,688,0.98,690,0.963,692,0.897,694,0.73,696,0.51,698,0.322,700,0.198,702,0.123,704,0.08,706,0.054,708,0.037,710,0.025,712,0.016,714,0.011",
   "Chroma G": "486,0.009,488,0.02,490,0.043,492,0.097,494,0.213,496,0.43,498,0.71,500,0.906,502,0.974,504,0.986,506,0.987,508,0.991,510,0.99,512,0.992,514,0.991,516,0.993,518,0.991,520,0.99,522,0.991,524,0.99,526,0.988,528,0.984,530,0.98,532,0.977,534,0.977,536,0.977,538,0.978,540,0.981,542,0.983,544,0.985,546,0.988,548,0.989,550,0.993,552,0.995,554,0.996,556,0.994,558,0.993,560,0.994,562,0.993,564,0.989,566,0.985,568,0.981,570,0.98,572,0.979,574,0.979,576,0.981,578,0.975,580,0.915,582,0.721,584,0.446,586,0.24,588,0.129,590,0.072,592,0.043,594,0.026,596,0.016,598,0.009",
   "Chroma B": "414,0.002,416,0.041,418,0.634,420,0.975,422,0.979,424,0.971,426,0.98,428,0.983,430,0.979,432,0.981,434,0.981,436,0.985,438,0.988,440,0.986,442,0.987,444,0.977,446,0.985,448,0.988,450,0.987,452,0.985,454,0.982,456,0.986,458,0.987,460,0.988,462,0.987,464,0.984,466,0.981,468,0.983,470,0.984,472,0.984,474,0.986,476,0.986,478,0.984,480,0.982,482,0.984,484,0.982,486,0.978,488,0.977,490,0.974,492,0.973,494,0.97,496,0.955,498,0.954,500,0.963,502,0.957,504,0.915,506,0.542,508,0.034,510,0.003",
   "Optolong R": "566,0,568,0.004,570,0.007,572,0.011,574,0.028,576,0.055,578,0.15,580,0.245,582,0.541,584,0.814,586,0.975,588,0.976,590,0.976,592,0.977,594,0.978,596,0.978,598,0.979,600,0.979,602,0.98,604,0.98,606,0.981,608,0.98,610,0.979,612,0.978,614,0.981,616,0.984,618,0.982,620,0.98,622,0.978,624,0.98,626,0.984,628,0.982,630,0.979,632,0.978,634,0.98,636,0.981,638,0.98,640,0.98,642,0.981,644,0.982,646,0.983,648,0.982,650,0.981,652,0.984,654,0.988,656,0.99,658,0.989,660,0.988,662,0.987,664,0.986,666,0.985,668,0.987,670,0.99,672,0.989,674,0.98,676,0.976,678,0.975,680,0.97,682,0.929,684,0.73,686,0.532,688,0.333,690,0.177,692,0.107,694,0.056,696,0.039,698,0.022,700,0.017,702,0.014,704,0.01,706,0.007,708,0.007,710,0.007,712,0.007,714,0.006,716,0.006,718,0.006,720,0.006,722,0.006,724,0.007,726,0.007,728,0.007,730,0.007,732,0.008,734,0.007,736,0.007,738,0.007,740,0.006,742,0.006,744,0.006",
   "Optolong G": "464,0,466,0.003,468,0.006,470,0.005,472,0.005,474,0.014,476,0.022,478,0.132,480,0.292,482,0.457,484,0.622,486,0.784,488,0.812,490,0.847,492,0.904,494,0.917,496,0.928,498,0.945,500,0.963,502,0.97,504,0.97,506,0.97,508,0.97,510,0.971,512,0.971,514,0.971,516,0.971,518,0.972,520,0.972,522,0.972,524,0.972,526,0.973,528,0.973,530,0.973,532,0.973,534,0.974,536,0.976,538,0.977,540,0.975,542,0.974,544,0.972,546,0.97,548,0.968,550,0.965,552,0.959,554,0.954,556,0.948,558,0.916,560,0.726,562,0.528,564,0.298,566,0.05,568,0.025,570,0.014,572,0.008,574,0.003,576,0.001,578,0",
   "Optolong B": "374,0.005,376,0.125,378,0.335,380,0.494,382,0.653,384,0.725,386,0.772,388,0.801,390,0.829,392,0.858,394,0.887,396,0.899,398,0.9,400,0.909,402,0.924,404,0.938,406,0.939,408,0.933,410,0.931,412,0.947,414,0.958,416,0.961,418,0.964,420,0.963,422,0.954,424,0.96,426,0.966,428,0.967,430,0.967,432,0.967,434,0.964,436,0.961,438,0.963,440,0.968,442,0.972,444,0.973,446,0.971,448,0.97,450,0.97,452,0.971,454,0.971,456,0.97,458,0.969,460,0.968,462,0.967,464,0.967,466,0.966,468,0.967,470,0.971,472,0.97,474,0.962,476,0.966,478,0.969,480,0.964,482,0.958,484,0.962,486,0.97,488,0.963,490,0.959,492,0.96,494,0.961,496,0.961,498,0.958,500,0.956,502,0.898,504,0.805,506,0.679,508,0.518,510,0.357,512,0.192,514,0.06,516,0.03,518,0.015,520,0.004,522,0.002,524,0"
};

// Generic UV-IR-cut "L" filter curve used for ALL luminance filters,
// regardless of telescope setup brand. Standard for SPFC L-channel work.
var GENERIC_L_CURVE = "300,0,400,0,420,1,500,1,680,1,700,0,800,0";
var GENERIC_L_NAME  = "Generic UV-IR-CUT Filter";

// Narrowband emission-line wavelengths (nm).
var NB = {
   Ha:   656.28,
   OIII: 500.70,
   SII:  672.40
};

// Palette -> channel mapping. `nb` flags whether the palette is narrowband.
var PALETTES = {
   "LRGB": { R: "R",    G: "G",    B: "B",    nb: false },
   "RGB":  { R: "R",    G: "G",    B: "B",    nb: false },
   "SHO":  { R: "SII",  G: "Ha",   B: "OIII", nb: true  },
   "HOO":  { R: "Ha",   G: "OIII", B: "OIII", nb: true  },
   "HSO":  { R: "Ha",   G: "SII",  B: "OIII", nb: true  },
   "OHS":  { R: "OIII", G: "Ha",   B: "SII",  nb: true  },
   "HOS":  { R: "Ha",   G: "OIII", B: "SII",  nb: true  }
};

var PALETTE_ORDER = [ "Auto detect", "LRGB", "RGB", "SHO", "HOO", "HSO", "OHS", "HOS" ];

// Mono filter -> (wavelength, isNarrowband) -- used for mono MGC.
var MONO_WAVELENGTH = {
   L:    550.0,
   R:    645.0,
   G:    532.0,
   B:    472.0,
   Ha:   NB.Ha,
   OIII: NB.OIII,
   SII:  NB.SII
};
var MONO_BROADBAND_BW = 100.0;   // nm, generic LRGB bandwidth

// ===========================================================================
// Utilities
// ===========================================================================

function log( s ) { console.writeln( s ); }

function uniqueId( base ) {
   var id = base;
   var n = 1;
   // ImageWindow.windowById returns a window whose isNull is true if not found.
   while ( !ImageWindow.windowById( id ).isNull )
   {
      id = base + "_" + n;
      ++n;
   }
   return id;
}

function findKeyword( kwArray, name ) {
   for ( var i = 0; i < kwArray.length; ++i )
      if ( kwArray[ i ].name == name )
         return kwArray[ i ];
   return null;
}

// Returns one of: "L", "R", "G", "B", "Ha", "OIII", "SII", or null.
function detectFilterFromHeader( window ) {
   var kw = findKeyword( window.keywords, "FILTER" );
   if ( kw == null ) return null;

   var v = kw.strippedValue;
   if ( v == null ) return null;
   v = v.toUpperCase().trim();
   if ( v.length == 0 ) return null;

   if ( v.indexOf( "HA" ) >= 0 || v.indexOf( "H-ALPHA" ) >= 0 ||
        v.indexOf( "H_ALPHA" ) >= 0 || v == "H" )                return "Ha";
   if ( v.indexOf( "OIII" ) >= 0 || v.indexOf( "O-III" ) >= 0 ||
        v.indexOf( "O3" ) >= 0 || v == "O" )                     return "OIII";
   if ( v.indexOf( "SII" ) >= 0 || v.indexOf( "S-II" ) >= 0 ||
        v.indexOf( "S2" ) >= 0 || v == "S" )                     return "SII";
   if ( v.indexOf( "LUM" ) >= 0 || v == "L" )                    return "L";
   if ( v.indexOf( "RED" ) >= 0 || v == "R" )                    return "R";
   if ( v.indexOf( "GREEN" ) >= 0 || v == "G" )                  return "G";
   if ( v.indexOf( "BLUE" ) >= 0 || v == "B" )                   return "B";
   return null;
}

// Look for palette tokens in an image id (case-insensitive, non-alphanumeric
// boundaries on both sides). Order matters: check 4-letter tokens first.
function detectPaletteFromName( id ) {
   var u = id.toUpperCase();
   var tokens = [ "LRGB", "SHO", "HOO", "HSO", "OHS", "HOS", "RGB" ];
   for ( var i = 0; i < tokens.length; ++i )
   {
      var t = tokens[ i ];
      var idx = -1;
      var from = 0;
      while ( ( idx = u.indexOf( t, from ) ) >= 0 )
      {
         var before = ( idx == 0 ) ? "" : u.charAt( idx - 1 );
         var after  = ( idx + t.length >= u.length ) ? "" : u.charAt( idx + t.length );
         var beforeOK = ( before == "" ) || !/[A-Z0-9]/.test( before );
         var afterOK  = ( after  == "" ) || !/[A-Z0-9]/.test( after  );
         if ( beforeOK && afterOK )
            return t;
         from = idx + 1;
      }
   }
   return null;
}

// Clone a window by saving it to a temporary XISF file and reopening it.
// Round-tripping through PI's native file format guarantees full fidelity
// for pixels, XISF properties, FITS keywords, astrometric solution, ICC
// profile, RGB working space, color space, bit depth, etc. Manual cloning
// (new ImageWindow + image.assign + per-property copy) introduced subtle
// data-path bugs that caused banding on filters with smaller dynamic range
// than L -- this avoids the whole class of issues.
function cloneWindow( srcWindow, newId ) {
   var finalId = uniqueId( newId );
   var tmpPath = File.systemTempDirectory +
                 "/_GradientComparison_clone_" +
                 (new Date()).getTime() + "_" +
                 Math.floor( Math.random() * 1e6 ) + ".xisf";

   try {
      // saveAs(filePath, queryOptions, allowMessages, strict, verifyChecksums)
      srcWindow.saveAs( tmpPath, false, false, false, false );
   } catch ( e ) {
      throw new Error( "cloneWindow saveAs failed: " + e.toString() );
   }

   var opened;
   try {
      opened = ImageWindow.open( tmpPath );
   } catch ( e ) {
      try { File.remove( tmpPath ); } catch ( e2 ) {}
      throw new Error( "cloneWindow ImageWindow.open failed: " + e.toString() );
   }
   try { File.remove( tmpPath ); } catch ( e ) {}

   if ( !opened || opened.length == 0 )
      throw new Error( "cloneWindow: no windows returned from open" );

   var w = opened[ 0 ];
   // If the source file contained additional images (rare for masters but
   // possible -- e.g. crop_mask sidecar), close the extras to keep the
   // workspace clean. Only the main image goes through the pipeline.
   for ( var i = 1; i < opened.length; ++i )
   {
      try { opened[ i ].forceClose(); } catch ( e ) {}
   }

   w.mainView.id = finalId;
   w.show();
   return w;
}

function renameView( view, newId ) {
   if ( view == null || view.isNull ) return null;
   view.id = uniqueId( newId );
   return view;
}

function snapshotWindowIds() {
   var arr = ImageWindow.windows;
   var ids = [];
   for ( var i = 0; i < arr.length; ++i )
      ids.push( arr[ i ].mainView.id );
   return ids;
}

function newWindowsSince( snapshot ) {
   var arr = ImageWindow.windows;
   var out = [];
   for ( var i = 0; i < arr.length; ++i )
   {
      var id = arr[ i ].mainView.id;
      if ( snapshot.indexOf( id ) < 0 )
         out.push( arr[ i ] );
   }
   return out;
}

// Try-set: assign a process parameter, swallowing errors if the parameter
// name isn't known on this PI build. Lets us be defensive across versions.
function trySet( P, name, value ) {
   try { P[ name ] = value; } catch ( e ) { /* parameter not present */ }
}

// ===========================================================================
// SpectrophotometricFluxCalibration (SPFC)
// ===========================================================================
// SPFC is the prerequisite for MultiscaleGradientCorrection. For color
// images it calibrates per channel; for mono images it calibrates a single
// channel using either a broadband filter curve name or a narrowband
// wavelength + bandwidth.

// Look up a filter curve CSV by full name (e.g. "Chroma R"). Returns null
// if not found. Any L-filter (e.g. "Chroma L", "Astrodon E-series L",
// "Optolong L") resolves to the GENERIC_L_CURVE so SPFC sees a consistent
// luminance passband across telescope setups.
function getFilterCSV( filterName ) {
   if ( FILTER_TR_CURVES[ filterName ] )
      return FILTER_TR_CURVES[ filterName ];
   if ( /\bL$/.test( filterName ) || / E-series L$/.test( filterName ) )
      return GENERIC_L_CURVE;
   return null;
}

function runSPFC( view, setupName, paletteName, monoFilter ) {
   var setup = SETUPS[ setupName ];
   var isMono = ( paletteName == "MONO" );

   var P = new SpectrophotometricFluxCalibration;

   // ---- general / catalog / PSF parameters (match user's GUI defaults) ----
   trySet( P, "catalogId",                  "GaiaDR3SP" );
   trySet( P, "minMagnitude",               0.00 );
   trySet( P, "limitMagnitude",             12.00 );
   trySet( P, "autoLimitMagnitude",         true );
   trySet( P, "rejectionLimit",             0.30 );
   trySet( P, "broadbandIntegrationStepSize", 0.50 );
   trySet( P, "narrowbandIntegrationSteps", 10 );
   trySet( P, "psfStructureLayers",         5 );
   trySet( P, "saturationThreshold",        0.75 );
   trySet( P, "saturationRelative",         true );
   trySet( P, "saturationShrinkFactor",     0.10 );
   trySet( P, "psfNoiseLayers",             1 );
   trySet( P, "psfHotPixelFilterRadius",    1 );
   trySet( P, "psfNoiseReductionFilterRadius", 0 );
   trySet( P, "psfMinStructureSize",        0 );
   trySet( P, "psfMinSNR",                  40.00 );
   trySet( P, "psfAllowClusteredSources",   false );
   trySet( P, "psfGrowth",                  1.75 );
   trySet( P, "psfMaxStars",                24576 );
   trySet( P, "psfSearchTolerance",         4.00 );
   trySet( P, "psfChannelSearchTolerance",  2.00 );
   trySet( P, "generateGraphs",             true );    // show flux graph popup
   trySet( P, "generateStarMaps",           false );
   trySet( P, "generateTextFiles",          false );
   trySet( P, "outputDirectory",            "" );
   try { P.psfType = SpectrophotometricFluxCalibration.PSFType_Auto; }
   catch ( e ) { /* class constant not present on this build */ }

   // ---- sensor QE curve (CSV data + name) ----
   var qeCSV = QE_CURVES[ setup.sensorQE ];
   if ( !qeCSV )
      throw new Error( "No QE curve data found for sensor '" + setup.sensorQE +
                       "'. Add it to QE_CURVES at the top of this script." );
   trySet( P, "deviceQECurve",     qeCSV );
   trySet( P, "deviceQECurveName", setup.sensorQE );

   if ( isMono )
   {
      // Mono: SPFC uses grayFilter* params. Per user's process dump, all four
      // gray slots (TrCurve, Name, Wavelength, Bandwidth) get set regardless
      // of broadband/narrowband. Broadband uses the LRGB filter curve;
      // narrowband uses the device QE curve as a stand-in (matches the dump
      // -- narrowband mode is driven by wavelength+bandwidth, not the CSV).
      var isNB = ( monoFilter == "Ha" || monoFilter == "OIII" || monoFilter == "SII" );
      var wl   = MONO_WAVELENGTH[ monoFilter ];
      var bw   = isNB ? setup.narrowbandBandwidth : MONO_BROADBAND_BW;

      trySet( P, "narrowbandMode", isNB );

      if ( monoFilter == "L" )
      {
         // Luminance -> always use the generic UV-IR-cut curve, ignoring
         // the per-setup brand. This is the standard L-filter calibration.
         trySet( P, "grayFilterTrCurve", GENERIC_L_CURVE );
         trySet( P, "grayFilterName",    GENERIC_L_NAME );
      }
      else
      {
         var curveName = FILTER_CURVES[ setup.lrgbBrand ][ monoFilter ];
         var filterCSV = curveName ? getFilterCSV( curveName ) : null;
         if ( filterCSV )
         {
            trySet( P, "grayFilterTrCurve", filterCSV );
            trySet( P, "grayFilterName",    curveName );
         }
         else
         {
            // Narrowband or no broadband curve known -- use QE as placeholder
            // CSV. SPFC ignores it in narrowband mode (uses wavelength/bandwidth).
            trySet( P, "grayFilterTrCurve", qeCSV );
            trySet( P, "grayFilterName",    setup.sensorQE );
         }
      }
      trySet( P, "grayFilterWavelength", wl );
      trySet( P, "grayFilterBandwidth",  bw );
   }
   else
   {
      var pal = PALETTES[ paletteName ];
      trySet( P, "narrowbandMode", !!pal.nb );

      if ( pal.nb )
      {
         var nbw = setup.narrowbandBandwidth;
         trySet( P, "redFilterWavelength",   NB[ pal.R ] );
         trySet( P, "redFilterBandwidth",    nbw         );
         trySet( P, "greenFilterWavelength", NB[ pal.G ] );
         trySet( P, "greenFilterBandwidth",  nbw         );
         trySet( P, "blueFilterWavelength",  NB[ pal.B ] );
         trySet( P, "blueFilterBandwidth",   nbw         );
         // Per the dump, populate the curve slots even in narrowband mode.
         trySet( P, "redFilterTrCurve",   qeCSV );
         trySet( P, "greenFilterTrCurve", qeCSV );
         trySet( P, "blueFilterTrCurve",  qeCSV );
         trySet( P, "redFilterName",      setup.sensorQE );
         trySet( P, "greenFilterName",    setup.sensorQE );
         trySet( P, "blueFilterName",     setup.sensorQE );
         trySet( P, "grayFilterTrCurve",  qeCSV );
         trySet( P, "grayFilterName",     setup.sensorQE );
      }
      else
      {
         var curves = FILTER_CURVES[ setup.lrgbBrand ];
         var rCSV = getFilterCSV( curves.R );
         var gCSV = getFilterCSV( curves.G );
         var bCSV = getFilterCSV( curves.B );
         if ( !rCSV || !gCSV || !bCSV )
            throw new Error( "Missing FILTER_TR_CURVES entry for one of: '" +
                             curves.R + "', '" + curves.G + "', '" + curves.B + "'." );
         trySet( P, "redFilterTrCurve",   rCSV );
         trySet( P, "greenFilterTrCurve", gCSV );
         trySet( P, "blueFilterTrCurve",  bCSV );
         trySet( P, "redFilterName",      curves.R );
         trySet( P, "greenFilterName",    curves.G );
         trySet( P, "blueFilterName",     curves.B );
         // Populate gray slot too (matches dump pattern).
         trySet( P, "grayFilterTrCurve",  qeCSV );
         trySet( P, "grayFilterName",     setup.sensorQE );
      }
   }

   if ( !P.executeOn( view ) )
      throw new Error( "SPFC failed -- see console above. Likely cause: the image " +
                       "isn't plate-solved, or PI rejected the embedded curves." );
}

// ===========================================================================
// GradientCorrection
// ===========================================================================

function runGradientCorrection( view ) {
   var P = new GradientCorrection;
   // Params match the user's process dump.
   trySet( P, "reference",                  0.50 );
   trySet( P, "lowThreshold",               0.20 );
   trySet( P, "lowTolerance",               0.50 );
   trySet( P, "highThreshold",              0.05 );
   trySet( P, "highTolerance",              0.00 );
   trySet( P, "iterations",                 15 );
   trySet( P, "scale",                      5.00 );
   trySet( P, "smoothness",                 0.40 );
   trySet( P, "downsamplingFactor",         16 );
   trySet( P, "protection",                 true );
   trySet( P, "protectionThreshold",        0.10 );
   trySet( P, "protectionAmount",           0.50 );
   trySet( P, "protectionSmoothingFactor",  16 );
   trySet( P, "lowClippingLevel",           0.000076 );
   trySet( P, "automaticConvergence",       false );
   trySet( P, "convergenceLimit",           0.00001000 );
   trySet( P, "maxIterations",              10 );
   trySet( P, "useSimplification",          false );
   trySet( P, "simplificationDegree",       1 );
   trySet( P, "simplificationScale",        1024 );
   trySet( P, "generateSimpleModel",        false );
   trySet( P, "generateGradientModel",      true );    // produces _bg window
   trySet( P, "generateProtectionMasks",    false );
   trySet( P, "gridSamplingDelta",          16 );
   P.executeOn( view );
}

// ===========================================================================
// MultiscaleGradientCorrection
// ===========================================================================

// Map our mono filter codes to MARS database filter names.
// MARS DR1 has L/R/G/B (broadband). Narrowband data has no MARS entry, so
// we fall back to the closest broadband filter -- Ha/SII -> R, OIII -> G.
var MARS_FILTER_MAP = {
   L:    "L",
   R:    "R",
   G:    "G",
   B:    "B",
   Ha:   "R",
   OIII: "G",
   SII:  "R"
};

function runMultiscaleGradientCorrection( view, setupName, paletteName, monoFilter ) {
   var P = new MultiscaleGradientCorrection;

   // MGC in PI 1.9.4 uses the MARS database (Multiscale All-Sky Reference)
   // as its gradient-free reference, NOT SPFC's embedded calibration.
   // Database file paths are user-specific -- edit MARS_DB_FILES below.
   P.useMARSDatabase = true;
   P.marsDatabaseFiles = [
      [true, "/Users/evan/Astro/Pixinsight Core Files/mars/MARS-DR1-1.1.1.xmars"],
      [true, "/Users/evan/Astro/Pixinsight Core Files/mars/MARS-DR1-u01-1.0.1.xmars"]
   ];

   // Filter slot: mono goes in gray; color goes in red/green/blue.
   if ( paletteName == "MONO" && monoFilter != null )
   {
      var marsF = MARS_FILTER_MAP[ monoFilter ] || "L";
      trySet( P, "grayMARSFilter", marsF );
   }
   else
   {
      trySet( P, "redMARSFilter",   "R" );
      trySet( P, "greenMARSFilter", "G" );
      trySet( P, "blueMARSFilter",  "B" );
   }

   trySet( P, "referenceImageId",    "" );        // empty -> use MARS DB
   trySet( P, "gradientScale",       1024 );
   trySet( P, "structureSeparation", 3 );
   trySet( P, "modelSmoothness",     1.00 );
   trySet( P, "minFieldRatio",       0.017 );
   trySet( P, "maxFieldRatio",       0.167 );
   trySet( P, "enforceFieldLimits",  true );
   trySet( P, "scaleFactorRK",       1.0000 );
   trySet( P, "scaleFactorG",        1.0000 );
   trySet( P, "scaleFactorB",        1.0000 );
   trySet( P, "showGradientModel",   true );      // produces _bg window
   trySet( P, "command",             "" );

   P.executeOn( view );
}

// ===========================================================================
// AutomaticBackgroundExtraction
// ===========================================================================

function runABE( view ) {
   // The PI class is AutomaticBackgroundExtractor (no "ion" suffix).
   var P = new AutomaticBackgroundExtractor;
   // Params match the user's process dump, with one override (replaceTarget)
   // so the corrected pixels land on our clone instead of in a new window.
   trySet( P, "tolerance",                  1.000 );
   trySet( P, "deviation",                  0.800 );
   trySet( P, "unbalance",                  1.800 );
   trySet( P, "minBoxFraction",             0.050 );
   trySet( P, "maxBackground",              1.0000 );
   trySet( P, "minBackground",              0.0000 );
   trySet( P, "useBrightnessLimits",        false );
   trySet( P, "polyDegree",                 4 );
   trySet( P, "boxSize",                    5 );
   trySet( P, "boxSeparation",              5 );
   trySet( P, "abeDownsample",              2.00 );
   trySet( P, "writeSampleBoxes",           false );
   trySet( P, "justTrySamples",             false );
   trySet( P, "normalize",                  false );
   trySet( P, "discardModel",               false );
   trySet( P, "replaceTarget",              true  );   // OVERRIDE: in-place
   trySet( P, "verboseCoefficients",        false );
   trySet( P, "compareModel",               false );
   trySet( P, "compareFactor",              10.00 );
   try {
      P.targetCorrection = AutomaticBackgroundExtractor.Correction_Subtract;
      P.modelImageSampleFormat = AutomaticBackgroundExtractor.ModelFormat_f32;
      P.correctedImageSampleFormat = AutomaticBackgroundExtractor.CorrectedFormat_SameAsTarget;
   } catch ( e ) { /* class constants not present on this build */ }
   P.executeOn( view );
}

// ===========================================================================
// Pipeline
// ===========================================================================

function runPipeline( targetWin, setupName, paletteName, monoFilter ) {
   var baseId = targetWin.mainView.id;
   var isMono = ( paletteName == "MONO" );

   log( "============================================================" );
   log( TITLE + " v" + VERSION );
   log( "Target:   " + baseId );
   log( "Setup:    " + setupName );
   log( "Palette:  " + ( isMono ? ( "MONO (" + monoFilter + ")" ) : paletteName ) );
   log( "============================================================" );

   // For each gradient method we clone the ORIGINAL and run that method
   // directly on the clone. SPFC is applied ONLY to the MGC clone (the
   // historical workflow); GC and ABE see raw pixels, matching what you'd
   // get running those processes manually on the original.

   function runOne( label, suffix, useSPFC, runFn )
   {
      var correctedTargetId = baseId + suffix;
      var clone = cloneWindow( targetWin, correctedTargetId );
      var cloneFinalId = clone.mainView.id;

      // Step A (optional): SPFC for methods that historically expect it.
      if ( useSPFC )
      {
         log( "[" + label + "] SPFC on " + cloneFinalId + " ..." );
         try {
            runSPFC( clone.mainView, setupName, paletteName, monoFilter );
         } catch ( e ) {
            log( "[" + label + "] SPFC FAILED: " + e.toString() );
            log( "[" + label + "] continuing without SPFC calibration." );
         }
      }

      // Step B: gradient process.
      var before = snapshotWindowIds();
      log( "[" + label + "] " + label + " on " + cloneFinalId + " ..." );
      try {
         runFn( clone.mainView );
      } catch ( e ) {
         log( "[" + label + "] ERROR: " + e.toString() );
         return;
      }

      // Step C: capture any residual / gradient-model window that appeared.
      var created = newWindowsSince( before );
      var residual = null;
      for ( var i = 0; i < created.length; ++i )
         if ( created[ i ].mainView.id != cloneFinalId )
         {
            residual = created[ i ];
            break;
         }

      if ( residual != null )
      {
         renameView( residual.mainView, baseId + suffix + "_bg" );
         log( "[" + label + "]   corrected -> " + clone.mainView.id );
         log( "[" + label + "]   residual  -> " + residual.mainView.id );
      }
      else
      {
         log( "[" + label + "]   corrected -> " + clone.mainView.id +
              " (no residual window was produced)" );
      }
   }

   log( "[GC ] Gradient Correction (no SPFC)" );
   runOne( "GC", "_GC", false, function ( v ) { runGradientCorrection( v ); } );

   log( "[MGC] Multiscale Gradient Correction (with SPFC)" );
   runOne( "MGC", "_MGC", true, function ( v ) {
      runMultiscaleGradientCorrection( v, setupName,
                                       isMono ? "MONO" : paletteName,
                                       monoFilter );
   } );

   log( "[ABE] Automatic Background Extraction (no SPFC)" );
   runOne( "ABE", "_ABE", false, function ( v ) { runABE( v ); } );

   log( "Done. Original window '" + baseId + "' was not modified." );
}

// ===========================================================================
// Dialog
// ===========================================================================

var GradientComparisonDialog = class extends Dialog
{
   constructor()
   {
      super();

      var self = this;

   this.windowTitle = TITLE + " " + VERSION;
   this.minWidth = 520;

   // --- Target image -----------------------------------------------------
   this.targetLabel = new Label( this );
   this.targetLabel.text = "Target image:";
   this.targetLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.targetLabel.minWidth = 120;

   this.targetView = new ViewList( this );
   this.targetView.getMainViews();
   this.targetView.onViewSelected = function ( /*view*/ ) {
      self.refreshAutoDetect();
   };

   var targetRow = new HorizontalSizer;
   targetRow.spacing = 6;
   targetRow.add( this.targetLabel );
   targetRow.add( this.targetView, 100 );

   // --- Setup ------------------------------------------------------------
   this.setupLabel = new Label( this );
   this.setupLabel.text = "Telescope setup:";
   this.setupLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.setupLabel.minWidth = 120;

   this.setupCombo = new ComboBox( this );
   for ( var i = 0; i < SETUP_ORDER.length; ++i )
      this.setupCombo.addItem( SETUP_ORDER[ i ] );
   this.setupCombo.currentItem = 0;

   var setupRow = new HorizontalSizer;
   setupRow.spacing = 6;
   setupRow.add( this.setupLabel );
   setupRow.add( this.setupCombo, 100 );

   // --- Palette ----------------------------------------------------------
   this.paletteLabel = new Label( this );
   this.paletteLabel.text = "Palette (RGB):";
   this.paletteLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.paletteLabel.minWidth = 120;

   this.paletteCombo = new ComboBox( this );
   for ( var j = 0; j < PALETTE_ORDER.length; ++j )
      this.paletteCombo.addItem( PALETTE_ORDER[ j ] );
   this.paletteCombo.currentItem = 0;       // Auto detect

   var paletteRow = new HorizontalSizer;
   paletteRow.spacing = 6;
   paletteRow.add( this.paletteLabel );
   paletteRow.add( this.paletteCombo, 100 );

   // --- Detected info box ------------------------------------------------
   this.detectedInfo = new Label( this );
   this.detectedInfo.frameStyle = FrameStyle.Box;
   this.detectedInfo.minHeight = 56;
   this.detectedInfo.useRichText = true;
   this.detectedInfo.wordWrapping = true;
   this.detectedInfo.margin = 6;

   // --- Buttons ----------------------------------------------------------
   this.runBtn = new PushButton( this );
   this.runBtn.text = " Run ";
   this.runBtn.defaultButton = true;
   this.runBtn.onClick = function () { this.dialog.ok(); };

   this.cancelBtn = new PushButton( this );
   this.cancelBtn.text = " Cancel ";
   this.cancelBtn.onClick = function () { this.dialog.cancel(); };


   this.helpBtn = new ToolButton( this );

   this.helpBtn.icon = this.scaledResource( ":/process-interface/browse-documentation.png" );

   this.helpBtn.toolTip = "Browse documentation";

   this.helpBtn.onClick = function() {

      try {

         if ( !Dialog.browseScriptDocumentation( "CustomGradientCorrect" ) )
            Dialog.openBrowser(
               "file://" + CoreApplication.installationDirectory +
               "/doc/scripts/CustomGradientCorrect/CustomGradientCorrect.html",
               "CustomGradientCorrect Documentation" );

      } catch ( e ) {

         console.warningln( "Could not open docs: " + e.message );

      }

   };


   var btnRow = new HorizontalSizer;
   btnRow.spacing = 8;

   btnRow.add( this.helpBtn );
   btnRow.addStretch();
   btnRow.add( this.runBtn );
   btnRow.add( this.cancelBtn );

   // --- Layout -----------------------------------------------------------
   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 6;
   this.sizer.add( targetRow );
   this.sizer.add( setupRow );
   this.sizer.add( paletteRow );
   this.sizer.add( this.detectedInfo );
   this.sizer.addSpacing( 6 );
   this.sizer.add( btnRow );

   this.adjustToContents();
   this.setVariableHeight();

   // --- Auto-detect helper ----------------------------------------------
   this.refreshAutoDetect = function () {
      var view = self.targetView.currentView;
      if ( view == null || view.isNull )
      {
         self.detectedInfo.text =
            "<i>No image selected. Open a target image and pick it above.</i>";
         return;
      }
      var win = view.window;
      var img = view.image;
      var rows = [];
      rows.push( "<b>Image:</b> " + view.id );
      if ( img.numberOfChannels == 1 )
      {
         var f = detectFilterFromHeader( win );
         rows.push( "<b>Mono.</b> FITS FILTER &rarr; <b>" +
                    ( f != null ? f : "(not found)" ) + "</b>" );
         if ( f == null )
            rows.push( "<i>Add a FILTER FITS keyword (L/R/G/B/Ha/OIII/SII) " +
                       "or the script can't run.</i>" );
      }
      else
      {
         var p = detectPaletteFromName( view.id );
         rows.push( "<b>Color (" + img.numberOfChannels + " channels).</b> " +
                    "Palette from name &rarr; <b>" +
                    ( p != null ? p : "(none -- pick one above)" ) + "</b>" );
      }
      self.detectedInfo.text = rows.join( "<br/>" );
   };

      this.refreshAutoDetect();
   }
};

// ===========================================================================
// Main
// ===========================================================================

function main() {
   if ( ImageWindow.windows.length == 0 )
   {
      (new MessageBox(
         "No images are open. Open the image you want to process " +
         "and re-run this script.",
         TITLE, StdIcon.Error, StdButton.Ok )).execute();
      return;
   }

   var dlg = new GradientComparisonDialog;
   if ( !dlg.execute() )
      return;

   var view = dlg.targetView.currentView;
   if ( view == null || view.isNull )
   {
      (new MessageBox(
         "No target image selected.",
         TITLE, StdIcon.Error, StdButton.Ok )).execute();
      return;
   }

   var win   = view.window;
   var img   = view.image;
   var setup = SETUP_ORDER[ dlg.setupCombo.currentItem ];

   var palette;
   var monoFilter = null;

   if ( img.numberOfChannels == 1 )
   {
      palette = "MONO";
      monoFilter = detectFilterFromHeader( win );
      if ( monoFilter == null )
      {
         (new MessageBox(
            "Mono image: could not detect FILTER from the FITS header.\n\n" +
            "SPFC and MGC both need the filter wavelength for a mono " +
            "image. Add a FILTER keyword (L, R, G, B, Ha, OIII, or SII) " +
            "to the image and try again.",
            TITLE, StdIcon.Error, StdButton.Ok )).execute();
         return;
      }
   }
   else
   {
      var choice = PALETTE_ORDER[ dlg.paletteCombo.currentItem ];
      if ( choice == "Auto detect" )
      {
         palette = detectPaletteFromName( view.id );
         if ( palette == null )
         {
            (new MessageBox(
               "Could not auto-detect a palette from the image name '" +
               view.id + "'.\n\n" +
               "Pick a palette explicitly (LRGB, RGB, SHO, HOO, HSO, " +
               "OHS, or HOS) from the Palette dropdown and try again.",
               TITLE, StdIcon.Error, StdButton.Ok )).execute();
            return;
         }
      }
      else
      {
         palette = choice;
      }
   }

   console.show();
   runPipeline( win, setup, palette, monoFilter );
}

main();
