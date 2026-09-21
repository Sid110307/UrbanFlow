import type {
  Coordinate,
  SilkboardCamera,
  SilkboardDrainInlet,
  SilkboardDrainNode,
  SilkboardFlyoverSegment,
  SilkboardPeripheralDrain,
  SilkboardRoadSensor,
  SilkboardScenarioRef,
} from "../types";

// ─── Silk Board Junction Center & Bounds ─────────────────────────────────────
export const SILKBOARD_CENTER: Coordinate = [77.622597, 12.917301];
export const SILKBOARD_BOUNDS: [number, number, number, number] = [
  77.6140, 12.9110, 77.6310, 12.9230,
];
export const SILKBOARD_ZOOM = 16;

// ─── Elevated Flyover Structures (from flyover.geojson) ─────────────────────
// Represents the actual multi-level elevated road network:
// Level 1: Silk Board Flyover, Double Decker Flyover, Ragigudda-Silkboard Flyover
// Level 2: Electronic City Elevated Expressway (BETL) and Interchange Ramps
export const FLYOVER_STRUCTURES: SilkboardFlyoverSegment[] = [
  {
    "id": "way/40696221",
    "name": "Silk Board Flyover",
    "highway": "trunk",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.621936,
        12.918664
      ],
      [
        77.621982,
        12.918593
      ],
      [
        77.622339,
        12.918044
      ],
      [
        77.622893,
        12.91714
      ],
      [
        77.624045,
        12.915119
      ]
    ]
  },
  {
    "id": "way/40696222",
    "name": "Silk Board Flyover",
    "highway": "trunk",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.623942,
        12.915066
      ],
      [
        77.623347,
        12.916143
      ],
      [
        77.62279,
        12.917108
      ],
      [
        77.622735,
        12.917197
      ],
      [
        77.622476,
        12.91762
      ],
      [
        77.621857,
        12.918616
      ]
    ]
  },
  {
    "id": "way/103269863",
    "name": "Electronic City Flyover",
    "highway": "motorway",
    "layer": 2,
    "bridge": "viaduct",
    "coordinates": [
      [
        77.66989,
        12.846749
      ],
      [
        77.670313,
        12.846961
      ],
      [
        77.670462,
        12.847054
      ],
      [
        77.670544,
        12.847117
      ],
      [
        77.670593,
        12.847158
      ],
      [
        77.670644,
        12.847203
      ],
      [
        77.670693,
        12.847255
      ],
      [
        77.670727,
        12.847302
      ],
      [
        77.670765,
        12.84736
      ],
      [
        77.670788,
        12.84741
      ],
      [
        77.670802,
        12.84748
      ],
      [
        77.67081,
        12.847543
      ],
      [
        77.670806,
        12.847619
      ],
      [
        77.670798,
        12.847686
      ],
      [
        77.670775,
        12.847758
      ],
      [
        77.670754,
        12.847799
      ],
      [
        77.670678,
        12.847932
      ],
      [
        77.670581,
        12.848096
      ],
      [
        77.670286,
        12.84848
      ],
      [
        77.667198,
        12.852386
      ],
      [
        77.666087,
        12.853785
      ],
      [
        77.665718,
        12.854252
      ],
      [
        77.664847,
        12.855356
      ],
      [
        77.664691,
        12.855546
      ],
      [
        77.664117,
        12.856228
      ],
      [
        77.663459,
        12.85706
      ],
      [
        77.662226,
        12.858669
      ],
      [
        77.660962,
        12.860236
      ],
      [
        77.659875,
        12.861601
      ],
      [
        77.658076,
        12.863882
      ],
      [
        77.656384,
        12.866004
      ],
      [
        77.655421,
        12.867211
      ],
      [
        77.653119,
        12.870126
      ],
      [
        77.651037,
        12.872779
      ],
      [
        77.650885,
        12.872969
      ],
      [
        77.65073,
        12.873154
      ],
      [
        77.650421,
        12.873516
      ],
      [
        77.650258,
        12.873695
      ],
      [
        77.650106,
        12.873861
      ],
      [
        77.649809,
        12.874194
      ],
      [
        77.649505,
        12.874526
      ],
      [
        77.649319,
        12.874734
      ],
      [
        77.649131,
        12.874938
      ],
      [
        77.648788,
        12.875318
      ],
      [
        77.647718,
        12.876549
      ],
      [
        77.647311,
        12.877094
      ],
      [
        77.646793,
        12.877898
      ],
      [
        77.642852,
        12.884313
      ],
      [
        77.642381,
        12.885079
      ],
      [
        77.641219,
        12.886972
      ],
      [
        77.638325,
        12.891673
      ],
      [
        77.637684,
        12.892714
      ],
      [
        77.636102,
        12.895286
      ],
      [
        77.634638,
        12.897655
      ],
      [
        77.633039,
        12.900293
      ],
      [
        77.632578,
        12.901048
      ],
      [
        77.63239,
        12.901358
      ],
      [
        77.632348,
        12.901426
      ],
      [
        77.631803,
        12.902316
      ],
      [
        77.631621,
        12.902615
      ],
      [
        77.628619,
        12.907445
      ],
      [
        77.62834,
        12.907904
      ]
    ]
  },
  {
    "id": "way/160511376",
    "name": "Electronic City Flyover",
    "highway": "motorway",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.627357,
        12.909699
      ],
      [
        77.627561,
        12.909319
      ]
    ]
  },
  {
    "id": "way/160511377",
    "name": "Electronic City Flyover",
    "highway": "motorway",
    "layer": 2,
    "bridge": "yes",
    "coordinates": [
      [
        77.628405,
        12.907937
      ],
      [
        77.628574,
        12.907659
      ],
      [
        77.629599,
        12.905999
      ],
      [
        77.631398,
        12.903089
      ],
      [
        77.632434,
        12.901403
      ],
      [
        77.635167,
        12.89694
      ],
      [
        77.637591,
        12.893
      ]
    ]
  },
  {
    "id": "way/519734960",
    "name": "Silkboard Double Decker Flyover",
    "highway": "primary",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.621379,
        12.918805
      ],
      [
        77.621415,
        12.918846
      ],
      [
        77.621525,
        12.91894
      ],
      [
        77.621612,
        12.919024
      ],
      [
        77.6217,
        12.919073
      ],
      [
        77.621876,
        12.9191
      ],
      [
        77.622045,
        12.919067
      ],
      [
        77.62218,
        12.919003
      ],
      [
        77.622293,
        12.918888
      ],
      [
        77.622398,
        12.918745
      ],
      [
        77.622529,
        12.918504
      ],
      [
        77.622614,
        12.918329
      ],
      [
        77.622717,
        12.918105
      ]
    ]
  },
  {
    "id": "way/886153772",
    "name": "Ragigudda-Silk Board Integrated Flyover",
    "highway": "primary",
    "layer": 1,
    "bridge": "viaduct",
    "coordinates": [
      [
        77.600982,
        12.916771
      ],
      [
        77.601889,
        12.916756
      ],
      [
        77.604627,
        12.91673
      ],
      [
        77.605509,
        12.916699
      ],
      [
        77.606897,
        12.916649
      ],
      [
        77.608769,
        12.916627
      ],
      [
        77.610679,
        12.91659
      ],
      [
        77.611825,
        12.916583
      ],
      [
        77.613949,
        12.916502
      ],
      [
        77.614203,
        12.916493
      ],
      [
        77.615065,
        12.916439
      ],
      [
        77.61558,
        12.916401
      ],
      [
        77.616117,
        12.916331
      ],
      [
        77.616666,
        12.916271
      ],
      [
        77.617104,
        12.916282
      ],
      [
        77.617565,
        12.916312
      ],
      [
        77.618979,
        12.916334
      ],
      [
        77.619319,
        12.916344
      ],
      [
        77.619535,
        12.916378
      ],
      [
        77.619758,
        12.916463
      ],
      [
        77.620075,
        12.916597
      ]
    ]
  },
  {
    "id": "way/886153773",
    "name": "Silk Board Flyover",
    "highway": "primary",
    "layer": 1,
    "bridge": "viaduct",
    "coordinates": [
      [
        77.61887,
        12.916203
      ],
      [
        77.618335,
        12.916214
      ],
      [
        77.617581,
        12.916213
      ],
      [
        77.617089,
        12.916181
      ],
      [
        77.616665,
        12.916177
      ],
      [
        77.61554,
        12.916303
      ],
      [
        77.615037,
        12.916355
      ],
      [
        77.614198,
        12.916408
      ],
      [
        77.613909,
        12.916417
      ],
      [
        77.611827,
        12.916462
      ],
      [
        77.610685,
        12.916467
      ],
      [
        77.608758,
        12.916512
      ],
      [
        77.606888,
        12.916556
      ],
      [
        77.605531,
        12.916604
      ],
      [
        77.604614,
        12.916628
      ],
      [
        77.601885,
        12.916657
      ],
      [
        77.600978,
        12.91667
      ]
    ]
  },
  {
    "id": "way/1254771465",
    "name": "Silk Board Interchange",
    "highway": "primary_link",
    "layer": 2,
    "bridge": "yes",
    "coordinates": [
      [
        77.626947,
        12.917172
      ],
      [
        77.626484,
        12.917322
      ],
      [
        77.626055,
        12.91744
      ],
      [
        77.625865,
        12.917491
      ],
      [
        77.625668,
        12.917534
      ],
      [
        77.625432,
        12.917555
      ],
      [
        77.625194,
        12.917568
      ],
      [
        77.624956,
        12.917569
      ],
      [
        77.624653,
        12.917538
      ],
      [
        77.62336,
        12.917267
      ],
      [
        77.622818,
        12.916913
      ],
      [
        77.622455,
        12.916839
      ],
      [
        77.622115,
        12.916771
      ],
      [
        77.621873,
        12.916699
      ],
      [
        77.621467,
        12.916587
      ]
    ]
  },
  {
    "id": "way/1299917512",
    "name": "Silkboard Double Decker Flyover",
    "highway": "primary",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.622717,
        12.918105
      ],
      [
        77.622918,
        12.917699
      ],
      [
        77.623324,
        12.916882
      ],
      [
        77.623475,
        12.916388
      ],
      [
        77.623716,
        12.915926
      ],
      [
        77.624007,
        12.915398
      ],
      [
        77.624275,
        12.914926
      ]
    ]
  },
  {
    "id": "way/1299917514",
    "name": "Ramp A",
    "highway": "primary",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.620075,
        12.916597
      ],
      [
        77.620134,
        12.916633
      ],
      [
        77.620252,
        12.91673
      ],
      [
        77.620404,
        12.916864
      ],
      [
        77.620484,
        12.916928
      ],
      [
        77.620623,
        12.917045
      ],
      [
        77.620847,
        12.917298
      ],
      [
        77.621099,
        12.917625
      ],
      [
        77.621172,
        12.917718
      ],
      [
        77.621293,
        12.917926
      ],
      [
        77.621313,
        12.917994
      ],
      [
        77.621331,
        12.918104
      ],
      [
        77.621352,
        12.918287
      ],
      [
        77.621357,
        12.918598
      ],
      [
        77.62139,
        12.918736
      ],
      [
        77.621379,
        12.918805
      ]
    ]
  },
  {
    "id": "way/1299917517",
    "name": "Silkboard Double Decker Flyover",
    "highway": "primary_link",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.622717,
        12.918105
      ],
      [
        77.623008,
        12.917862
      ],
      [
        77.623169,
        12.917767
      ],
      [
        77.623335,
        12.917691
      ],
      [
        77.62348,
        12.917667
      ],
      [
        77.623807,
        12.917669
      ],
      [
        77.624004,
        12.917696
      ],
      [
        77.624196,
        12.91773
      ],
      [
        77.624417,
        12.917765
      ],
      [
        77.624649,
        12.917791
      ],
      [
        77.624878,
        12.917816
      ],
      [
        77.625112,
        12.917816
      ],
      [
        77.625328,
        12.917826
      ],
      [
        77.62574,
        12.917802
      ]
    ]
  },
  {
    "id": "way/1299932382",
    "name": "Silkboard Double Decker Flyover",
    "highway": "primary_link",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.620505,
        12.917026
      ],
      [
        77.620817,
        12.917343
      ],
      [
        77.621111,
        12.917741
      ],
      [
        77.621222,
        12.917941
      ],
      [
        77.621244,
        12.918007
      ],
      [
        77.621269,
        12.918113
      ],
      [
        77.62129,
        12.918283
      ],
      [
        77.621291,
        12.918613
      ],
      [
        77.621322,
        12.918753
      ],
      [
        77.621379,
        12.918805
      ]
    ]
  },
  {
    "id": "way/1301808818",
    "name": "Silkboard Double Decker Flyover",
    "highway": "primary_link",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.62574,
        12.917802
      ],
      [
        77.626066,
        12.91773
      ],
      [
        77.626519,
        12.917584
      ]
    ]
  },
  {
    "id": "way/1351994264",
    "name": "Ragigudda-Silk Board Integrated Flyover (u/c)",
    "highway": "primary_link",
    "layer": 1,
    "bridge": "viaduct",
    "coordinates": [
      [
        77.621467,
        12.916587
      ],
      [
        77.621205,
        12.9165
      ],
      [
        77.620478,
        12.916274
      ],
      [
        77.620026,
        12.916143
      ],
      [
        77.61887,
        12.916203
      ]
    ]
  },
  {
    "id": "way/1422778330",
    "name": "Silk Board Flyover",
    "highway": "primary_link",
    "layer": 1,
    "bridge": "yes",
    "coordinates": [
      [
        77.61887,
        12.916203
      ],
      [
        77.618507,
        12.916146
      ],
      [
        77.618033,
        12.916129
      ]
    ]
  }
];

// ─── Peripheral Drains (Along Actual Flyover Ground Roads) ───────────────────
// Stormwater conduits running directly along the curbs and shoulders of the
// ground-level road network beneath and around the elevated flyover decks,
// connecting to city-wide primary and tertiary drains.
export const PERIPHERAL_DRAINS: SilkboardPeripheralDrain[] = [
  {
    "id": "PD-ORR-W",
    "name": "ORR West Ground Drain (BTM -> Silk Board)",
    "coordinates": [
      [
        77.616305,
        12.916353
      ],
      [
        77.61669,
        12.916319
      ],
      [
        77.617067,
        12.916318
      ],
      [
        77.617543,
        12.916351
      ],
      [
        77.618718,
        12.916354
      ],
      [
        77.619266,
        12.916369
      ],
      [
        77.619445,
        12.916389
      ],
      [
        77.619882,
        12.916467
      ],
      [
        77.620028,
        12.916508
      ],
      [
        77.620183,
        12.916551
      ],
      [
        77.621033,
        12.916775
      ],
      [
        77.621105,
        12.916798
      ],
      [
        77.621284,
        12.916854
      ],
      [
        77.62149,
        12.916919
      ],
      [
        77.621669,
        12.916976
      ],
      [
        77.622233,
        12.91717
      ],
      [
        77.622456,
        12.917251
      ],
      [
        77.622597,
        12.917301
      ]
    ],
    "capacity_liters_per_sec": 480,
    "connected_city_drain_id": "PRI-0011"
  },
  {
    "id": "PD-ORR-E",
    "name": "ORR East Ground Drain (Silk Board -> HSR)",
    "coordinates": [
      [
        77.622597,
        12.917301
      ],
      [
        77.622828,
        12.917374
      ],
      [
        77.622926,
        12.917395
      ],
      [
        77.623148,
        12.917448
      ],
      [
        77.623628,
        12.917561
      ],
      [
        77.624383,
        12.917682
      ],
      [
        77.624737,
        12.917708
      ],
      [
        77.625022,
        12.917711
      ],
      [
        77.625459,
        12.917707
      ],
      [
        77.625732,
        12.917676
      ],
      [
        77.625962,
        12.91763
      ],
      [
        77.626797,
        12.917401
      ],
      [
        77.628395,
        12.916927
      ],
      [
        77.628597,
        12.916879
      ],
      [
        77.628817,
        12.91686
      ],
      [
        77.629255,
        12.916824
      ]
    ],
    "capacity_liters_per_sec": 520,
    "connected_city_drain_id": "TER-0431"
  },
  {
    "id": "PD-HSR-N",
    "name": "Hosur Road North Ground Drain (Madiwala Approach)",
    "coordinates": [
      [
        77.620374,
        12.921081
      ],
      [
        77.62054,
        12.920783
      ],
      [
        77.620695,
        12.920505
      ],
      [
        77.620725,
        12.920452
      ],
      [
        77.620747,
        12.920417
      ],
      [
        77.620865,
        12.920231
      ],
      [
        77.620906,
        12.920159
      ],
      [
        77.620985,
        12.92006
      ],
      [
        77.621354,
        12.919521
      ],
      [
        77.621405,
        12.919448
      ],
      [
        77.621536,
        12.919328
      ],
      [
        77.621911,
        12.918907
      ],
      [
        77.622185,
        12.918505
      ],
      [
        77.622259,
        12.918357
      ],
      [
        77.622368,
        12.9182
      ],
      [
        77.622446,
        12.918068
      ],
      [
        77.622502,
        12.917983
      ],
      [
        77.622727,
        12.91761
      ],
      [
        77.622795,
        12.917451
      ],
      [
        77.622828,
        12.917374
      ]
    ],
    "capacity_liters_per_sec": 450,
    "connected_city_drain_id": "TER-3212"
  },
  {
    "id": "PD-HSR-S",
    "name": "Hosur Road South Ground Drain (Central -> E-City Link)",
    "coordinates": [
      [
        77.622951,
        12.917289
      ],
      [
        77.623035,
        12.917215
      ],
      [
        77.623375,
        12.916476
      ],
      [
        77.623439,
        12.916363
      ],
      [
        77.623486,
        12.916291
      ],
      [
        77.62356,
        12.916322
      ],
      [
        77.623585,
        12.916306
      ],
      [
        77.623607,
        12.916256
      ],
      [
        77.623678,
        12.916109
      ],
      [
        77.623717,
        12.916064
      ],
      [
        77.623759,
        12.916036
      ],
      [
        77.623803,
        12.916016
      ],
      [
        77.624045,
        12.915119
      ],
      [
        77.624226,
        12.914811
      ],
      [
        77.624392,
        12.914519
      ],
      [
        77.624659,
        12.914074
      ],
      [
        77.625171,
        12.913232
      ],
      [
        77.62535,
        12.912941
      ],
      [
        77.625544,
        12.912629
      ],
      [
        77.62612,
        12.911459
      ],
      [
        77.625158,
        12.913026
      ],
      [
        77.624811,
        12.913592
      ],
      [
        77.624363,
        12.914296
      ],
      [
        77.624202,
        12.914595
      ],
      [
        77.624095,
        12.914787
      ]
    ],
    "capacity_liters_per_sec": 500,
    "connected_city_drain_id": "SEC-0136"
  },
  {
    "id": "PD-SLIP-NE",
    "name": "Northeast Ground Slip Drain (Hosur Rd N -> ORR E)",
    "coordinates": [
      [
        77.622185,
        12.918505
      ],
      [
        77.622259,
        12.918455
      ],
      [
        77.622321,
        12.918413
      ],
      [
        77.622508,
        12.918108
      ],
      [
        77.622529,
        12.918074
      ],
      [
        77.622739,
        12.917712
      ],
      [
        77.622787,
        12.917647
      ],
      [
        77.622869,
        12.91759
      ],
      [
        77.622994,
        12.917547
      ],
      [
        77.623101,
        12.917559
      ],
      [
        77.62312,
        12.917564
      ],
      [
        77.623638,
        12.917701
      ],
      [
        77.624375,
        12.917828
      ],
      [
        77.624814,
        12.917872
      ],
      [
        77.625297,
        12.917891
      ],
      [
        77.625692,
        12.917868
      ],
      [
        77.62574,
        12.917866
      ],
      [
        77.625838,
        12.917857
      ],
      [
        77.626442,
        12.917697
      ],
      [
        77.626744,
        12.917591
      ],
      [
        77.627066,
        12.917475
      ],
      [
        77.627129,
        12.917407
      ]
    ],
    "capacity_liters_per_sec": 380,
    "connected_city_drain_id": "TER-0433"
  },
  {
    "id": "PD-SLIP-SW",
    "name": "Southwest Ground Slip Drain (Hosur Rd S -> ORR W)",
    "coordinates": [
      [
        77.622954,
        12.91655
      ],
      [
        77.622862,
        12.916585
      ],
      [
        77.622778,
        12.916609
      ],
      [
        77.622647,
        12.916652
      ],
      [
        77.62252,
        12.916698
      ],
      [
        77.622466,
        12.916719
      ],
      [
        77.622329,
        12.916777
      ],
      [
        77.62226,
        12.916803
      ],
      [
        77.622181,
        12.916851
      ],
      [
        77.622149,
        12.916863
      ],
      [
        77.6221,
        12.916881
      ],
      [
        77.621968,
        12.916928
      ],
      [
        77.621518,
        12.916776
      ],
      [
        77.619936,
        12.916313
      ]
    ],
    "capacity_liters_per_sec": 360,
    "connected_city_drain_id": "TER-0562"
  },
  {
    "id": "PD-UNDERPASS",
    "name": "Central Grade Underpass Collector Drain",
    "coordinates": [
      [
        77.621669,
        12.916976
      ],
      [
        77.622233,
        12.91717
      ],
      [
        77.622456,
        12.917251
      ],
      [
        77.622597,
        12.917301
      ],
      [
        77.622828,
        12.917374
      ],
      [
        77.622926,
        12.917395
      ],
      [
        77.622951,
        12.917289
      ],
      [
        77.622803,
        12.917256
      ],
      [
        77.622657,
        12.917213
      ],
      [
        77.622301,
        12.91708
      ],
      [
        77.621968,
        12.916928
      ]
    ],
    "capacity_liters_per_sec": 600,
    "connected_city_drain_id": "PRI-0011"
  }
];

// ─── Drain Inlets (Placed on Actual Intersection Ground Roads) ───────────────
// Surface catchpits, grate openings, and curb gutters located precisely along
// the ground road intersection where stormwater drains from the asphalt surface.
export const DRAIN_INLETS: SilkboardDrainInlet[] = [
  {
    "id": "IN-01",
    "drain_segment_id": "PD-ORR-W",
    "position": [
      77.617067,
      12.916318
    ],
    "type": "surface_inlet"
  },
  {
    "id": "IN-02",
    "drain_segment_id": "PD-ORR-W",
    "position": [
      77.620028,
      12.916508
    ],
    "type": "grate"
  },
  {
    "id": "IN-03",
    "drain_segment_id": "PD-ORR-W",
    "position": [
      77.622233,
      12.91717
    ],
    "type": "curb_opening"
  },
  {
    "id": "IN-04",
    "drain_segment_id": "PD-ORR-E",
    "position": [
      77.622926,
      12.917395
    ],
    "type": "grate"
  },
  {
    "id": "IN-05",
    "drain_segment_id": "PD-ORR-E",
    "position": [
      77.624737,
      12.917708
    ],
    "type": "surface_inlet"
  },
  {
    "id": "IN-06",
    "drain_segment_id": "PD-ORR-E",
    "position": [
      77.626797,
      12.917401
    ],
    "type": "curb_opening"
  },
  {
    "id": "IN-07",
    "drain_segment_id": "PD-HSR-N",
    "position": [
      77.620695,
      12.920505
    ],
    "type": "surface_inlet"
  },
  {
    "id": "IN-08",
    "drain_segment_id": "PD-HSR-N",
    "position": [
      77.621405,
      12.919448
    ],
    "type": "grate"
  },
  {
    "id": "IN-09",
    "drain_segment_id": "PD-HSR-N",
    "position": [
      77.622502,
      12.917983
    ],
    "type": "curb_opening"
  },
  {
    "id": "IN-10",
    "drain_segment_id": "PD-HSR-S",
    "position": [
      77.623439,
      12.916363
    ],
    "type": "surface_inlet"
  },
  {
    "id": "IN-11",
    "drain_segment_id": "PD-HSR-S",
    "position": [
      77.623759,
      12.916036
    ],
    "type": "grate"
  },
  {
    "id": "IN-12",
    "drain_segment_id": "PD-HSR-S",
    "position": [
      77.625544,
      12.912629
    ],
    "type": "curb_opening"
  },
  {
    "id": "IN-13",
    "drain_segment_id": "PD-SLIP-NE",
    "position": [
      77.622529,
      12.918074
    ],
    "type": "grate"
  },
  {
    "id": "IN-14",
    "drain_segment_id": "PD-SLIP-NE",
    "position": [
      77.625297,
      12.917891
    ],
    "type": "surface_inlet"
  },
  {
    "id": "IN-15",
    "drain_segment_id": "PD-SLIP-SW",
    "position": [
      77.622647,
      12.916652
    ],
    "type": "curb_opening"
  },
  {
    "id": "IN-16",
    "drain_segment_id": "PD-SLIP-SW",
    "position": [
      77.622149,
      12.916863
    ],
    "type": "grate"
  },
  {
    "id": "IN-17",
    "drain_segment_id": "PD-UNDERPASS",
    "position": [
      77.622597,
      12.917301
    ],
    "type": "grate"
  },
  {
    "id": "IN-18",
    "drain_segment_id": "PD-UNDERPASS",
    "position": [
      77.622803,
      12.917256
    ],
    "type": "curb_opening"
  }
];

// ─── CCTV Cameras (Mounted at Ground Intersection Traffic Signal Gantries) ──
// Strategic CCTV feeds with line of sight along the ground corridors beneath the flyover.
export const CAMERAS: SilkboardCamera[] = [
  {
    "id": "CAM-01",
    "label": "North Approach \u2014 Hosur Road Ground Intersection",
    "position": [
      77.621405,
      12.919448
    ],
    "bearing": 165,
    "coverage_angle": 90,
    "coverage_radius": 120
  },
  {
    "id": "CAM-02",
    "label": "Central Underpass \u2014 Silk Board Grade-Level Nexus",
    "position": [
      77.622597,
      12.917301
    ],
    "bearing": 195,
    "coverage_angle": 105,
    "coverage_radius": 110
  },
  {
    "id": "CAM-03",
    "label": "East Approach \u2014 ORR / HSR Ground Carriageway",
    "position": [
      77.624383,
      12.917682
    ],
    "bearing": 260,
    "coverage_angle": 85,
    "coverage_radius": 115
  }
];

// ─── Drain Nodes (10 Virtual Monitoring Hubs along Ground Corridors) ─────────
export const DRAIN_NODES: SilkboardDrainNode[] = [
  {
    "drain_id": "BLR-SKB-101",
    "position": [
      77.618845,
      12.916185
    ],
    "label": "ORR West Ground (BTM Approach)",
    "capacity_liters_per_sec": 480,
    "connected_city_drain_id": "PRI-0011"
  },
  {
    "drain_id": "BLR-SKB-102",
    "position": [
      77.622597,
      12.917301
    ],
    "label": "Central Silk Board Grade Underpass",
    "capacity_liters_per_sec": 600,
    "connected_city_drain_id": "PRI-0011"
  },
  {
    "drain_id": "BLR-SKB-103",
    "position": [
      77.623486,
      12.916291
    ],
    "label": "Hosur Road South Ground Corridor",
    "capacity_liters_per_sec": 450,
    "connected_city_drain_id": "SEC-0136"
  },
  {
    "drain_id": "BLR-SKB-104",
    "position": [
      77.622828,
      12.917374
    ],
    "label": "Silk Board Bus Terminal Ground Nexus",
    "capacity_liters_per_sec": 520,
    "connected_city_drain_id": "TER-5664"
  },
  {
    "drain_id": "BLR-SKB-105",
    "position": [
      77.624659,
      12.914074
    ],
    "label": "Hosur Road South (E-City Ramp Approach)",
    "capacity_liters_per_sec": 420,
    "connected_city_drain_id": "TER-0433"
  },
  {
    "drain_id": "BLR-SKB-106",
    "position": [
      77.624383,
      12.917682
    ],
    "label": "ORR East Ground (HSR Service Road)",
    "capacity_liters_per_sec": 500,
    "connected_city_drain_id": "TER-0431"
  },
  {
    "drain_id": "BLR-SKB-107",
    "position": [
      77.616305,
      12.916353
    ],
    "label": "ORR West Ground (BTM 2nd Stage Link)",
    "capacity_liters_per_sec": 400,
    "connected_city_drain_id": "TER-0562"
  },
  {
    "drain_id": "BLR-SKB-108",
    "position": [
      77.620865,
      12.920231
    ],
    "label": "Hosur Road North Ground (Madiwala)",
    "capacity_liters_per_sec": 460,
    "connected_city_drain_id": "TER-3212"
  },
  {
    "drain_id": "BLR-SKB-109",
    "position": [
      77.622185,
      12.918505
    ],
    "label": "Northeast Slip Interchange Ground Link",
    "capacity_liters_per_sec": 380,
    "connected_city_drain_id": "TER-0484"
  },
  {
    "drain_id": "BLR-SKB-110",
    "position": [
      77.621968,
      12.916928
    ],
    "label": "Southwest Slip Interchange Ground Link",
    "capacity_liters_per_sec": 360,
    "connected_city_drain_id": "TER-1231"
  }
];

// ─── Road Surface IoT Sensors (24 Sensors along Actual Ground Roads) ────────
export const ROAD_SENSORS: SilkboardRoadSensor[] = [
  {
    "id": "RS-01",
    "drain_node_id": "BLR-SKB-101",
    "position": [
      77.617318,
      12.916116
    ],
    "type": "water_level"
  },
  {
    "id": "RS-02",
    "drain_node_id": "BLR-SKB-101",
    "position": [
      77.618845,
      12.916185
    ],
    "type": "flow"
  },
  {
    "id": "RS-03",
    "drain_node_id": "BLR-SKB-101",
    "position": [
      77.621284,
      12.916854
    ],
    "type": "pressure"
  },
  {
    "id": "RS-04",
    "drain_node_id": "BLR-SKB-102",
    "position": [
      77.622233,
      12.91717
    ],
    "type": "water_level"
  },
  {
    "id": "RS-05",
    "drain_node_id": "BLR-SKB-102",
    "position": [
      77.622597,
      12.917301
    ],
    "type": "water_level"
  },
  {
    "id": "RS-06",
    "drain_node_id": "BLR-SKB-102",
    "position": [
      77.622657,
      12.917213
    ],
    "type": "flow"
  },
  {
    "id": "RS-07",
    "drain_node_id": "BLR-SKB-103",
    "position": [
      77.622951,
      12.917289
    ],
    "type": "water_level"
  },
  {
    "id": "RS-08",
    "drain_node_id": "BLR-SKB-103",
    "position": [
      77.623486,
      12.916291
    ],
    "type": "pressure"
  },
  {
    "id": "RS-09",
    "drain_node_id": "BLR-SKB-103",
    "position": [
      77.623962,
      12.914723
    ],
    "type": "flow"
  },
  {
    "id": "RS-10",
    "drain_node_id": "BLR-SKB-104",
    "position": [
      77.622828,
      12.917374
    ],
    "type": "water_level"
  },
  {
    "id": "RS-11",
    "drain_node_id": "BLR-SKB-104",
    "position": [
      77.622926,
      12.917395
    ],
    "type": "water_level"
  },
  {
    "id": "RS-12",
    "drain_node_id": "BLR-SKB-104",
    "position": [
      77.623305,
      12.91735
    ],
    "type": "pressure"
  },
  {
    "id": "RS-13",
    "drain_node_id": "BLR-SKB-105",
    "position": [
      77.624045,
      12.915119
    ],
    "type": "water_level"
  },
  {
    "id": "RS-14",
    "drain_node_id": "BLR-SKB-105",
    "position": [
      77.624659,
      12.914074
    ],
    "type": "flow"
  },
  {
    "id": "RS-15",
    "drain_node_id": "BLR-SKB-105",
    "position": [
      77.625544,
      12.912629
    ],
    "type": "pressure"
  },
  {
    "id": "RS-16",
    "drain_node_id": "BLR-SKB-106",
    "position": [
      77.624383,
      12.917682
    ],
    "type": "water_level"
  },
  {
    "id": "RS-17",
    "drain_node_id": "BLR-SKB-106",
    "position": [
      77.624737,
      12.917708
    ],
    "type": "flow"
  },
  {
    "id": "RS-18",
    "drain_node_id": "BLR-SKB-106",
    "position": [
      77.627129,
      12.917407
    ],
    "type": "water_level"
  },
  {
    "id": "RS-19",
    "drain_node_id": "BLR-SKB-107",
    "position": [
      77.616305,
      12.916353
    ],
    "type": "water_level"
  },
  {
    "id": "RS-20",
    "drain_node_id": "BLR-SKB-107",
    "position": [
      77.616846,
      12.916142
    ],
    "type": "flow"
  },
  {
    "id": "RS-21",
    "drain_node_id": "BLR-SKB-107",
    "position": [
      77.618033,
      12.916129
    ],
    "type": "pressure"
  },
  {
    "id": "RS-22",
    "drain_node_id": "BLR-SKB-108",
    "position": [
      77.620374,
      12.921081
    ],
    "type": "water_level"
  },
  {
    "id": "RS-23",
    "drain_node_id": "BLR-SKB-108",
    "position": [
      77.620865,
      12.920231
    ],
    "type": "flow"
  },
  {
    "id": "RS-24",
    "drain_node_id": "BLR-SKB-108",
    "position": [
      77.621405,
      12.919448
    ],
    "type": "water_level"
  }
];

// ─── Scenario Reference Data ───────────────────────────────────────────────
// Predefined scenarios the agent knows about. The agent can also detect
// novel scenarios beyond this set.
export const SCENARIO_REFERENCES: SilkboardScenarioRef[] = [
  {
    id: "SCN-01",
    name: "Drain Capacity Breach",
    description: "A drain node exceeds 90% capacity, predicting road flooding within 10 minutes if trend continues.",
    trigger_conditions: [
      "water_level_cm > 90% of capacity",
      "flow_velocity_mps dropping (indicating backup)",
      "trend sustained for > 2 minutes",
    ],
    expected_agent_action: "Alert + dispatch crew + visual triage via nearest camera",
  },
  {
    id: "SCN-02",
    name: "Inlet Backflow",
    description: "Adjacent drain overflow causes water to reverse flow through inlets, pushing water onto the road surface.",
    trigger_conditions: [
      "inlet flow_direction = 'backflow'",
      "connected drain at > 95% capacity",
      "road sensor near inlet shows 'pooling' or 'flooding'",
    ],
    expected_agent_action: "High-priority alert — water actively entering road from drain system",
  },
  {
    id: "SCN-03",
    name: "Bottleneck Cascade",
    description: "Upstream blockage causes pressure buildup that cascades downstream, overloading multiple segments.",
    trigger_conditions: [
      "one drain blocked (flow_velocity ≈ 0)",
      "upstream drains show rising water levels",
      "downstream drains show starvation (low flow)",
    ],
    expected_agent_action: "Identify blockage source + map cascade path + dispatch to root cause",
  },
  {
    id: "SCN-04",
    name: "Multi-Sensor Correlation",
    description: "3+ sensors in a zone spike simultaneously, confirming a localized waterlogging event vs. sensor noise.",
    trigger_conditions: [
      "3+ road sensors within 100m show 'pooling' or 'flooding'",
      "correlation within a 60-second window",
      "drain node in zone shows elevated water level",
    ],
    expected_agent_action: "Confirmed waterlogging zone — mark on map + camera confirmation",
  },
  {
    id: "SCN-05",
    name: "Rain vs Blockage Disambiguation",
    description: "The core agentic judgment: is elevated water level explained by rainfall or a physical blockage?",
    trigger_conditions: [
      "water_level_cm elevated beyond rainfall expectation",
      "flow_velocity_mps inconsistent with rain-driven runoff",
      "neighbor drains NOT showing same pattern (isolated anomaly)",
    ],
    expected_agent_action: "Gemini causal disambiguation call → classify as normal_runoff or probable_blockage",
  },
];

// ─── Helper: get all sensor positions for map bounds ───────────────────────
export function getAllSensorPositions(): Coordinate[] {
  return [
    ...DRAIN_NODES.map((n) => n.position),
    ...ROAD_SENSORS.map((s) => s.position),
    ...DRAIN_INLETS.map((i) => i.position),
    ...CAMERAS.map((c) => c.position),
  ];
}

/** Look up which drain node a road sensor belongs to */
export function getDrainNodeForSensor(sensorId: string): SilkboardDrainNode | undefined {
  const sensor = ROAD_SENSORS.find((s) => s.id === sensorId);
  if (!sensor) return undefined;
  return DRAIN_NODES.find((n) => n.drain_id === sensor.drain_node_id);
}

/** Get all inlets for a peripheral drain segment */
export function getInletsForDrain(drainId: string): SilkboardDrainInlet[] {
  return DRAIN_INLETS.filter((i) => i.drain_segment_id === drainId);
}

/** Get the nearest camera to a position */
export function getNearestCamera(pos: Coordinate): SilkboardCamera {
  let best = CAMERAS[0];
  let bestDist = Infinity;
  for (const cam of CAMERAS) {
    const d = (cam.position[0] - pos[0]) ** 2 + (cam.position[1] - pos[1]) ** 2;
    if (d < bestDist) { best = cam; bestDist = d; }
  }
  return best;
}
