import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

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

  app.use(express.json({ limit: '2mb' }));

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

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: contentsPrompt,
          config: genConfig,
        });
      } catch (primaryErr) {
        const errText = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        if (errText.includes('503') || errText.includes('UNAVAILABLE')) {
          response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: contentsPrompt,
            config: genConfig,
          });
        } else {
          throw primaryErr;
        }
      }

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
