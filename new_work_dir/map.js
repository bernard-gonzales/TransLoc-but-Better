import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

// Replace with the actual UVA client ID once you find it.
const UVA_CLIENT_ID = 1250;

// Very primitive in-memory cache
let cachedVehicles = [];
let lastFetch = 0;
const CACHE_MS = 5000;

// TODO: update this to the real Ride Systems vehicles endpoint for UVA
async function fetchUvaVehiclesFromRideSystems() {
  // Example shape – you’ll need to adjust URL/params to match their API.
  const url = `https://admin.ridesystems.net/api/Vehicles/GetVehiclesForClient?clientId=${UVA_CLIENT_ID}`;

  const resp = await fetch(url, {
    headers: {
      // If an API key or auth token is required:
      // 'Authorization': `Bearer ${process.env.RIDESYSTEMS_TOKEN}`
    }
  });

  if (!resp.ok) {
    throw new Error(`RideSystems error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();

  // Normalize into a clean, frontend-friendly shape
  return data.map(v => ({
    id: v.VehicleId || v.Id,
    routeId: v.RouteId,
    routeName: v.RouteName,
    lat: v.Latitude || v.Lat,
    lng: v.Longitude || v.Lon,
    heading: v.Heading,
    lastUpdated: v.LastUpdated || v.LastUpdate
  }));
}

app.get('/api/vehicles', async (req, res) => {
  const now = Date.now();
  try {
    if (now - lastFetch > CACHE_MS) {
      cachedVehicles = await fetchUvaVehiclesFromRideSystems();
      lastFetch = now;
    }
    res.json(cachedVehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

// optional: routes metadata
app.get('/api/routes', async (req, res) => {
  // similar pattern: call Ride Systems "GetRoutesForClient" etc.
  res.json([]);
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
