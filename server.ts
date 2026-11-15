import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '16mb' }));

  // Allow requests from Capacitor Android WebView and same-origin preview
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/sahanka-ai/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'sahanka-ai-v2',
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
    });
  });

  app.post('/api/sahanka-ai/analyze', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          ok: false,
          error: 'Adeegga Gemini API furihiisa lama helin server-ka.',
        });
        return;
      }

      const {
        mode,
        centerLat,
        centerLon,
        boundaryAreaHa,
        hydrology10Yr,
        complianceAudit,
        detectedWadiCount,
        elevationRangeM,
        userNotes,
      } = req.body || {};

      const promptPayload = {
        mode: mode === 'manual' ? 'Gacanta & Hubinta' : 'Raadinta Tooska ah ee 10 Sano',
        goobta: {
          lat: Number(centerLat || 0),
          lon: Number(centerLon || 0),
          bedkaHa: Number(boundaryAreaHa || 0),
        },
        roobkaIyoDaadka10Sano: hydrology10Yr || {},
        hubinta15mIyo90x48: complianceAudit || {},
        tiradaDooxyada: Number(detectedWadiCount || 0),
        jooggaDhulkaM: elevationRangeM || {},
        qoraalkaIsticmaalaha: userNotes ? String(userNotes).slice(0, 500) : '',
      };

      const genConfig = {
        systemInstruction:
          'Waxaad tahay injineer sare oo ku takhasusay sahanka dhulka (GIS Cadastral Surveying), biyo-mareennada dooxyada 10-ka sano, iyo qaybinta caddaaladda ah ee dhulka dhaxalka Islaamka. Ku qor Af-Soomaali kooban, cad, oo xirfad leh. Xaqiiji xeerarka: Block = 90x48m, Waddo 4-ta dhinac = 15m, Plot buuxa = 18x24m (432 m²), Half-plot = 216 m² (18x12m geesaha 1,5,6,10 iyo 9x24m dhexe 2,3,4,7,8,9), dooxa <= 30m = Heer 3. Jawaab kasta ka dhig mid kooban (2-3 weedhood qayb kasta).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dulmarGuud: {
              type: Type.STRING,
              description: 'Dulmar kooban oo ku saabsan bedka beerta, blocks-ka, plots-ka iyo joogga dhulka.',
            },
            falanqaynta10SanoDooxa: {
              type: Type.STRING,
              description: 'Falanqaynta xogta roobka iyo daadka 10-ka sano iyo saamaynta dooxyada.',
            },
            hubinta15mIyo90x48: {
              type: Type.STRING,
              description: 'Natiijada hubinta cabbirka 90x48m, waddada 15m ee 4-ta dhinac iyo half-plots 216m².',
            },
            talooyinkaHeerarkaDhaxalka: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 talo oo kooban oo ku saabsan Heerarka 1-3 iyo qaybinta caddaaladda ah ee dhaxalka.',
            },
            digniinahaMuhiimka: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '0 ilaa 3 digniin oo kooban haddii khatar daad ama khalad cabbir jiro.',
            },
          },
          required: [
            'dulmarGuud',
            'falanqaynta10SanoDooxa',
            'hubinta15mIyo90x48',
            'talooyinkaHeerarkaDhaxalka',
            'digniinahaMuhiimka',
          ],
        },
      };

      const contentsPrompt = `Falanqee xogtan sahanka GIS ee beerta iyo dhaxalka, kuna soo celi JSON kooban oo Af-Soomaali cad ah:\n${JSON.stringify(
        promptPayload
      )}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contentsPrompt,
        config: genConfig,
      });

      const rawText = response.text;
      if (!rawText) {
        res.status(502).json({
          ok: false,
          error: 'Jawaab faaruq ah ayaa ka timid moodelka falanqaynta.',
        });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json({
        ok: true,
        ...parsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Khalad lama filaan ah ayaa dhacay.';
      res.status(500).json({
        ok: false,
        error: message,
      });
    }
  });

  app.post('/api/pdf-inheritance-import/analyze', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          ok: false,
          error:
            'Adeegga Gemini API lama diyaarin server-ka. Vector PDF ama qoraalka tooska ah ayaad weli isticmaali kartaa.',
        });
        return;
      }

      const body = (req.body || {}) as {
        analysisMode?: 'color_legend_summary' | 'plot_assignments';
        fileName?: string;
        imageBase64?: string;
        mimeType?: string;
        imageMimeType?: string;
        vectorTextTokens?: string;
        extractedVectorText?: string;
        cadSpatialSummary?: string;
        detectedColorSwatches?: Array<{
          colorId: string;
          hex: string;
          colorNameSomali?: string;
          detectedPlotCount: number;
        }>;
        activeHeirs?: {
          heirKey: string;
          heirIndex?: number;
          personName: string;
          roleTitleSomali?: string;
          colorHex?: string;
        }[];
        heirs?: {
          heirKey: string;
          heirIndex?: number;
          personName: string;
          roleTitleSomali?: string;
          colorHex?: string;
        }[];
        validPlotIds?: string[];
        cadPlotIds?: string[];
        pageNumber?: number;
      };

      const analysisMode =
        body.analysisMode === 'color_legend_summary' ? 'color_legend_summary' : 'plot_assignments';
      const imageBase64 = body.imageBase64;
      const mimeType = body.mimeType || body.imageMimeType || 'image/jpeg';
      const vectorTextTokens = body.vectorTextTokens ?? body.extractedVectorText ?? '';
      const resolvedHeirs = Array.isArray(body.activeHeirs)
        ? body.activeHeirs
        : Array.isArray(body.heirs)
        ? body.heirs
        : [];
      const resolvedPlotIds = Array.isArray(body.validPlotIds)
        ? body.validPlotIds
        : Array.isArray(body.cadPlotIds)
        ? body.cadPlotIds
        : [];
      const pageNumber = Number(body.pageNumber || 1);
      const cadSpatialSummary = body.cadSpatialSummary ? String(body.cadSpatialSummary).slice(0, 12000) : '';

      if (!imageBase64 && !vectorTextTokens) {
        res.status(400).json({
          ok: false,
          error: 'Fadlan soo dir sawirka PDF-ka ama qoraalka faylka.',
        });
        return;
      }

      const heirCatalog = resolvedHeirs.slice(0, 80).map((h, i) => {
        const idx = h.heirIndex ?? i + 1;
        const rolePart = h.roleTitleSomali ? ` - ${h.roleTitleSomali}` : '';
        const colorPart = h.colorHex ? ` [${h.colorHex}]` : '';
        return `#${idx}: ${h.personName}${rolePart}${colorPart}`;
      });

      if (analysisMode === 'color_legend_summary') {
        const swatchesText = Array.isArray(body.detectedColorSwatches) && body.detectedColorSwatches.length > 0
          ? body.detectedColorSwatches
              .slice(0, 40)
              .map((s) => `${s.colorId}: ${s.hex} (${s.colorNameSomali || ''}) -> ~${s.detectedPlotCount} plots`)
              .join('\n')
          : 'Lama hayo swatches hore.';

        const legendPrompt = [
          `Waxaad eegaysaa sawirka bogga ${pageNumber} ee khariidadda dhulka dhaxalka.`,
          'SHUQULKAAGA KELIYA: Akhri tirada guud ee Blocks iyo Plots-ka khariidadda ka muuqda, kadibna akhri sanduuqa Legend-ka / midabada plots-ka (magaca ku hor qoran midab kasta, hex-ka u dhow, iyo haddii midabku u muuqdo mid aan dhaxale ahayn sida Black / Danguud / Waddo / Doox).',
          `MIDABADA PIXEL-KA EE HORAY LOOGA HELAY SAWIRKA:\n${swatchesText}`,
          heirCatalog.length > 0
            ? `LIISKA DHAXLAYAASHA (${resolvedHeirs.length} qof):\n${heirCatalog.join('\n')}`
            : 'LIISKA DHAXLAYAASHA: Weli lama gelin Xisaabiyaha.',
          'HA SOO SAARIN liis 500+ plots ah — kaliya soo saar Legend-ka midabada iyo tirakoobka Blocks & Plots!',
        ].join('\n\n');

        const legendParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
        if (imageBase64) {
          legendParts.push({ inlineData: { mimeType, data: imageBase64 } });
        }
        legendParts.push({ text: legendPrompt });

        const legendResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts: legendParts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'Waxaad tahay khabiir GIS Cadastral Map Reader. Kaliya ka akhri sawirka: tirada Blocks, tirada Plots, iyo liiska kooban ee midabada Legend-ka (magaca, hex-ka, iyo tirada plots-ka). Jawaab kooban oo JSON ah soo celi.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                totalBlocksEstimate: { type: Type.INTEGER },
                totalPlotsEstimate: { type: Type.INTEGER },
                summarySomali: { type: Type.STRING },
                legendItems: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      legendLabel: {
                        type: Type.STRING,
                        description: 'Magaca ama erayga Legend-ka ku qoran midabkan (tusaale Shamis, Xassan Cige, Blue, Black).',
                      },
                      colorHex: {
                        type: Type.STRING,
                        description: 'Hex color ku habboon midabkan sida #800026 ama #FACC15.',
                      },
                      colorNameSomali: {
                        type: Type.STRING,
                        description: 'Magaca midabka oo Af-Soomaali ah.',
                      },
                      estimatedPlotsCount: {
                        type: Type.INTEGER,
                        description: 'Qiyaasta tirada plots-ka leh midabkan.',
                      },
                      looksLikeNonHeir: {
                        type: Type.BOOLEAN,
                        description: 'True haddii uu u muuqdo Danguud/Waddo/Reeban/Doox ama midab dheeraad ah.',
                      },
                    },
                    required: ['legendLabel', 'colorHex', 'looksLikeNonHeir'],
                  },
                },
              },
              required: ['totalBlocksEstimate', 'totalPlotsEstimate', 'summarySomali', 'legendItems'],
            },
          },
        });

        const legendRaw = legendResp.text;
        if (!legendRaw) {
          res.status(502).json({ ok: false, error: 'Jawaab faaruq ah ayaa ka timid akhrinta Legend-ka.' });
          return;
        }
        res.json({ ok: true, mode: 'color_legend_summary', ...JSON.parse(legendRaw) });
        return;
      }

      const plotCatalog = resolvedPlotIds.slice(0, 1600);

      const instructionText = [
        `Waxaad akhrinaysaa bogga ${pageNumber}${body.fileName ? ` ee faylka "${String(body.fileName).slice(0, 120)}"` : ''} ee nashqad dhaxal dhul (Vector PDF ama Scan/Sawir) oo muujinaysa plot kasta iyo cidda dhaxalaha ah ama meesha gaarka ah (sida Danguud / Waddo / Reeban) ee loo qoondeeyey.`,
        plotCatalog.length > 0
          ? `LIISKA PLOTS-KA SAXDA AH EE CAD STUDIO (${resolvedPlotIds.length} wadar, ${plotCatalog.length} la soo diray):\n${plotCatalog.join(', ')}`
          : 'LIISKA PLOTS-KA CAD STUDIO: Weli lama hayo; soo saar Plot ID-ga sida uu faylka ugu qoran yahay (tusaale R1-C1-P01, B1-P1, P01).',
        cadSpatialSummary
          ? `QAAB-DHISMEEDKA KHARIIDADDA CAD STUDIO (Waqooyi/Sare -> Koonfur/Hoos, Galbeed/Bidix -> Bari/Midig):\n${cadSpatialSummary}`
          : '',
        heirCatalog.length > 0
          ? `LIISKA DHAXLAYAASHA FIRFIRCOON (Number/Midab/Magac):\n${heirCatalog.join('\n')}`
          : 'LIISKA DHAXLAYAASHA FIRFIRCOON: Weli lama gelin Xisaabiyaha; u soo qor magacyada dhaxlayaasha sida saxda ah ee PDF/Legend-ka ugu qoran.',
        vectorTextTokens
          ? `QORAALKA VECTOR-KA EE PDF-KA LAGA HELAY:\n${String(vectorTextTokens).slice(0, 20000)}`
          : '',
        'XEERARKA WAAFAJINTA (MUHIIM):',
        '1) Haddii boggu yahay KHARIIDAD MIDABAYSAN oo plots-ka dhexdiisa ay ku qoran yihiin lambaro (#1, 1, 2, W) ama midabo oo qura, ka eeg Legend-ka midabka/lambarka si aad u ogaato magaca dhaxalaha, kadibna ku beeg booska Block-ka/Saf-ka iyo QAAB-DHISMEEDKA KHARIIDADDA CAD STUDIO si aad u hesho normalizedPlotId sax ah.',
        '2) Haddii boggu yahay BOGGA HAL DHAXALE (tusaale magaca qofka ayaa kor ku qoran, plots-kiisuna midab gaar ah ayay khariidadda ku leeyihiin ama liis ayay ku qoran yihiin), soo saar DHAMMAAN plots-ka qofkaas u calaamadsan oo kaliya (ha ku darin kuwa cawlan ee dhaxlayaasha kale).',
        '3) Haddii boggu yahay JADWAL ama LIIS qoraal ah, soo saar sadar kasta adigoo rawPlotLabel iyo normalizedPlotId ku xidhaya plotCatalog.',
        '4) Haddii plot yar ama lambar qarsoon uu shaki ku jiro, calaamadi needsReview=true oo hoos u dhig confidencePct (60-84) si isticmaaluhu gacanta uga saxo.',
      ]
        .filter(Boolean)
        .join('\n\n');

      const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        });
      }
      parts.push({ text: instructionText });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'Waxaad tahay khabiir CAD & GIS Cadastral Digitizer. Shaqadaadu waa inaad sawirka ama Vector PDF-ka nashqadda dhaxalka ka soo saarto liis 100% qaabaysan oo plot kasta ku xidhaya magaca dhaxalaha saxda ah ama Danguud/Reeban. Marna ha iska abuurin plots aan muuqan; wixii aan caddayn u calaamadi needsReview=true.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedKind: {
                type: Type.STRING,
                description: 'One of: scanned_map, vector_map, allocation_table, hybrid',
              },
              summarySomali: {
                type: Type.STRING,
                description: 'Sharaxaad kooban oo Af-Soomaali ah oo sheegaysa waxa laga helay bogga iyo meelaha u baahan hubinta gacanta.',
              },
              assignments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    rawPlotLabel: {
                      type: Type.STRING,
                      description: 'Magaca ama lambarka plot-ka sida uu warqadda/PDF-ka ugu qoran yahay (e.g. B1-P1, R01-C01-P03, P14).',
                    },
                    normalizedPlotId: {
                      type: Type.STRING,
                      description: 'Plot ID-ga ugu dhow ee liiska CAD Studio haddii la helo, ama rawPlotLabel haddii aanu liiska ku jirin.',
                    },
                    assigneeName: {
                      type: Type.STRING,
                      description: 'Magaca dhaxalaha ama magaca gaarka ah (sida Danguud, Waddo, Reeban).',
                    },
                    isExcludedOrDanguud: {
                      type: Type.BOOLEAN,
                      description: 'True haddii plot-ku yahay Danguud, Waddo, Masaajid, ama dhul aan la qaybin.',
                    },
                    colorHexHint: {
                      type: Type.STRING,
                      description: 'Hex color sida #10B981 haddii midab gaar ah ku yaallo, ama string maran.',
                    },
                    confidencePct: {
                      type: Type.NUMBER,
                      description: 'Kalsoonida laga bilaabo 0 ilaa 100.',
                    },
                    needsReview: {
                      type: Type.BOOLEAN,
                      description: 'True haddii qoraalku yar yahay, qarsoon yahay, ama hubin gacan u baahan yahay.',
                    },
                    noteSomali: {
                      type: Type.STRING,
                      description: 'Sabab kooban haddii shaki jiro.',
                    },
                  },
                  required: [
                    'rawPlotLabel',
                    'normalizedPlotId',
                    'assigneeName',
                    'isExcludedOrDanguud',
                    'confidencePct',
                    'needsReview',
                  ],
                },
              },
            },
            required: ['detectedKind', 'summarySomali', 'assignments'],
          },
        },
      });

      const rawText = response.text;
      if (!rawText) {
        res.status(502).json({
          ok: false,
          error: 'Jawaab faaruq ah ayaa ka timid akhrinta PDF/Sawirka.',
        });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json({
        ok: true,
        ...parsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Khalad ayaa ku dhacay akhrinta PDF/Sawirka.';
      res.status(500).json({
        ok: false,
        error: message,
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
