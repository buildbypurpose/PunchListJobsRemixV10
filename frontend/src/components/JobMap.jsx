import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const jobIcon = L.divIcon({
  html: `<div style="width:28px;height:28px;background:#0000FF;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,255,0.5)"></div>`,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

const emergencyJobIcon = L.divIcon({
  html: `<div style="width:32px;height:32px;background:#EF4444;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(239,68,68,0.6)"></div>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const crewIcon = L.divIcon({
  html: `<div style="width:24px;height:24px;background:#050A30;border-radius:50%;border:3px solid #7EC8E3;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
  className: "",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const userIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;background:#10B981;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(16,185,129,0.3)"></div>`,
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// ─── US state centres ────────────────────────────────────────────────────────
const US_STATES = [
  { name: "Alabama",        lat: 32.806671,  lng: -86.791130  },
  { name: "Alaska",         lat: 61.370716,  lng: -152.404419 },
  { name: "Arizona",        lat: 33.729759,  lng: -111.431221 },
  { name: "Arkansas",       lat: 34.969704,  lng: -92.373123  },
  { name: "California",     lat: 36.116203,  lng: -119.681564 },
  { name: "Colorado",       lat: 39.059811,  lng: -105.311104 },
  { name: "Connecticut",    lat: 41.597782,  lng: -72.755371  },
  { name: "Delaware",       lat: 39.318523,  lng: -75.507141  },
  { name: "Florida",        lat: 27.766279,  lng: -81.686783  },
  { name: "Georgia",        lat: 33.040619,  lng: -83.643074  },
  { name: "Hawaii",         lat: 21.094318,  lng: -157.498337 },
  { name: "Idaho",          lat: 44.240459,  lng: -114.478828 },
  { name: "Illinois",       lat: 40.349457,  lng: -88.986137  },
  { name: "Indiana",        lat: 39.849426,  lng: -86.258278  },
  { name: "Iowa",           lat: 42.011539,  lng: -93.210526  },
  { name: "Kansas",         lat: 38.526600,  lng: -96.726486  },
  { name: "Kentucky",       lat: 37.668140,  lng: -84.670067  },
  { name: "Louisiana",      lat: 31.169960,  lng: -91.867805  },
  { name: "Maine",          lat: 44.693947,  lng: -69.381927  },
  { name: "Maryland",       lat: 39.063946,  lng: -76.802101  },
  { name: "Massachusetts",  lat: 42.230171,  lng: -71.530106  },
  { name: "Michigan",       lat: 43.326618,  lng: -84.536095  },
  { name: "Minnesota",      lat: 45.694454,  lng: -93.900192  },
  { name: "Mississippi",    lat: 32.741646,  lng: -89.678696  },
  { name: "Missouri",       lat: 38.456085,  lng: -92.288368  },
  { name: "Montana",        lat: 46.921925,  lng: -110.454353 },
  { name: "Nebraska",       lat: 41.125370,  lng: -98.268082  },
  { name: "Nevada",         lat: 38.313515,  lng: -117.055374 },
  { name: "New Hampshire",  lat: 43.452492,  lng: -71.563896  },
  { name: "New Jersey",     lat: 40.298904,  lng: -74.521011  },
  { name: "New Mexico",     lat: 34.840515,  lng: -106.248482 },
  { name: "New York",       lat: 42.165726,  lng: -74.948051  },
  { name: "North Carolina", lat: 35.630066,  lng: -79.806419  },
  { name: "North Dakota",   lat: 47.528912,  lng: -99.784012  },
  { name: "Ohio",           lat: 40.388783,  lng: -82.764915  },
  { name: "Oklahoma",       lat: 35.565342,  lng: -96.928917  },
  { name: "Oregon",         lat: 44.572021,  lng: -122.070938 },
  { name: "Pennsylvania",   lat: 40.590752,  lng: -77.209755  },
  { name: "Rhode Island",   lat: 41.680893,  lng: -71.511780  },
  { name: "South Carolina", lat: 33.856892,  lng: -80.945007  },
  { name: "South Dakota",   lat: 44.299782,  lng: -99.438828  },
  { name: "Tennessee",      lat: 35.747845,  lng: -86.692345  },
  { name: "Texas",          lat: 31.054487,  lng: -97.563461  },
  { name: "Utah",           lat: 40.150032,  lng: -111.862434 },
  { name: "Vermont",        lat: 44.045876,  lng: -72.710686  },
  { name: "Virginia",       lat: 37.769337,  lng: -78.169968  },
  { name: "Washington",     lat: 47.400902,  lng: -121.490494 },
  { name: "West Virginia",  lat: 38.491226,  lng: -80.954453  },
  { name: "Wisconsin",      lat: 44.268543,  lng: -89.616508  },
  { name: "Wyoming",        lat: 42.755966,  lng: -107.302490 },
];

// ─── Inner map helpers (must be inside <MapContainer>) ────────────────────────

/** Smoothly fly the map to a target centre + zoom. */
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? map.getZoom(), { duration: 1.2 });
  }, [target, map]);
  return null;
}

/** Re-centres when the userLocation prop changes (existing behaviour). */
function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

/**
 * On first mount: quietly request geolocation and fly there.
 * Only fires when no userLocation prop was supplied.
 */
function AutoLocate({ onLocate }) {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        map.flyTo([lat, lng], 12, { duration: 1.4 });
        onLocate?.({ lat, lng });
      },
      () => {} // silently ignore denied permission
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function JobMap({
  jobs = [],
  crew = [],
  userLocation,
  profileAddress,
  onLocate,
  onJobClick,
  height = "500px",
}) {
  const [bearing, setBearing]             = useState(0);
  const [flyTarget, setFlyTarget]         = useState(null);
  const [selectedState, setSelectedState] = useState("");
  const [locating, setLocating]           = useState(false);

  // Segmented control: "current" = GPS, "profile" = Profile Address
  const [mapMode, setMapMode]         = useState("current");
  const [profileCoords, setProfileCoords] = useState(null);
  const [geocoding, setGeocoding]     = useState(false);

  const defaultCenter = (mapMode === "profile" && profileCoords)
    ? [profileCoords.lat, profileCoords.lng]
    : userLocation
      ? [userLocation.lat, userLocation.lng]
      : [37.0902, -95.7129];
  const defaultZoom = (mapMode === "profile" && profileCoords) ? 13 : userLocation ? 12 : 4;

  // Geocode profileAddress when switching to profile mode
  const handleProfileMode = async () => {
    setMapMode("profile");
    if (profileCoords) {
      setFlyTarget({ ...profileCoords, zoom: 13 });
      return;
    }
    if (!profileAddress) return;
    setGeocoding(true);
    try {
      const res = await fetch(`${API}/utils/address/search?q=${encodeURIComponent(profileAddress)}&limit=1`);
      const data = await res.json();
      if (data[0]?.lat && data[0]?.lng) {
        const coords = { lat: data[0].lat, lng: data[0].lng };
        setProfileCoords(coords);
        setFlyTarget({ ...coords, zoom: 13 });
      }
    } catch { /* silently fail */ }
    setGeocoding(false);
  };

  const handleCurrentMode = () => {
    setMapMode("current");
    if (userLocation) {
      setFlyTarget({ ...userLocation, zoom: 13 });
    }
  };

  // Locate button handler
  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        setFlyTarget({ lat, lng, zoom: 14 });
        onLocate?.({ lat, lng });
        setLocating(false);
        setMapMode("current");
      },
      () => setLocating(false)
    );
  };

  // State selector handler
  const handleStateSelect = (e) => {
    const state = US_STATES.find(s => s.name === e.target.value);
    setSelectedState(e.target.value);
    if (state) setFlyTarget({ lat: state.lat, lng: state.lng, zoom: 7 });
  };

  const rotateCW  = () => setBearing(b => (b + 45) % 360);
  const rotateCCW = () => setBearing(b => (b - 45 + 360) % 360);
  const resetNorth = () => setBearing(0);

  return (
    <div
      style={{ height, width: "100%" }}
      className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner z-[2]"
    >
      {/* Rotatable map layer */}
      <div
        style={{
          height: "100%",
          width: "100%",
          transform: `rotate(${bearing}deg)`,
          transition: "transform 0.35s ease",
          transformOrigin: "center center",
        }}
      >
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Auto-locate on mount when parent hasn't supplied a position (current mode only) */}
          {!userLocation && mapMode === "current" && <AutoLocate onLocate={onLocate} />}

          {/* Fly to programmatic target (state select / locate button / profile mode) */}
          {flyTarget && <FlyTo target={flyTarget} />}

          {/* Keep centred when userLocation prop updates (current mode) */}
          {userLocation && mapMode === "current" && <RecenterMap center={[userLocation.lat, userLocation.lng]} />}

          {/* Current Location marker (GPS) */}
          {userLocation && mapMode === "current" && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
              <Popup>
                <div className="font-semibold text-green-700">Your Location</div>
              </Popup>
            </Marker>
          )}

          {/* Profile Address marker */}
          {profileCoords && mapMode === "profile" && (
            <Marker position={[profileCoords.lat, profileCoords.lng]} icon={userIcon}>
              <Popup>
                <div style={{ fontFamily: "Inter, sans-serif" }}>
                  <div className="font-semibold text-blue-700">Profile Address</div>
                  <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{profileAddress}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {jobs.map(job =>
            job.location?.lat && job.location?.lng ? (
              <Marker
                key={job.id}
                position={[job.location.lat, job.location.lng]}
                icon={job.is_emergency ? emergencyJobIcon : jobIcon}
                eventHandlers={{ click: () => onJobClick?.(job) }}
              >
                <Popup>
                  <div style={{ fontFamily: "Inter, sans-serif", minWidth: 200 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <strong>{job.title}</strong>
                      <span style={{ color: "#0000FF", fontWeight: "bold" }}>${job.pay_rate}/hr</span>
                    </div>
                    <p style={{ color: "#666", fontSize: 12, margin: "4px 0" }}>{job.contractor_name}</p>
                    <p style={{ fontSize: 12 }}>Trade: {job.trade}</p>
                    <p style={{ fontSize: 12 }}>Crew: {job.crew_accepted?.length || 0}/{job.crew_needed}</p>
                    {job.is_emergency && (
                      <span style={{ background: "#FEE2E2", color: "#DC2626", fontSize: 11, padding: "2px 6px", borderRadius: 4, fontWeight: "bold" }}>
                        EMERGENCY
                      </span>
                    )}
                  </div>
                </Popup>
              </Marker>
            ) : null
          )}

          {crew.map(member =>
            member.location?.lat && member.location?.lng ? (
              <Marker
                key={member.id}
                position={[member.location.lat, member.location.lng]}
                icon={crewIcon}
              >
                <Popup>
                  <div style={{ fontFamily: "Inter, sans-serif" }}>
                    <strong>{member.name}</strong>
                    <p style={{ fontSize: 12, color: "#666" }}>{member.trade || "General Labor"}</p>
                    <p style={{ fontSize: 12 }}>Rating: {member.rating?.toFixed(1) || "New"} ⭐</p>
                  </div>
                </Popup>
              </Marker>
            ) : null
          )}
        </MapContainer>
      </div>

      {/* ── Non-rotating control overlay ──────────────────────────────────── */}
      <div className="absolute inset-0 z-[5] pointer-events-none">

        {/* Segmented control (top-left) — only when profileAddress is available */}
        {profileAddress && (
          <div className="absolute top-3 left-3 pointer-events-auto" data-testid="map-mode-control">
            <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden text-xs font-bold">
              <button
                onClick={handleCurrentMode}
                className={`px-3 py-1.5 transition-colors whitespace-nowrap ${mapMode === "current" ? "bg-[#050A30] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                data-testid="map-mode-current"
              >
                Current Location
              </button>
              <button
                onClick={handleProfileMode}
                disabled={geocoding}
                className={`px-3 py-1.5 transition-colors whitespace-nowrap border-l border-slate-200 dark:border-slate-700 ${mapMode === "profile" ? "bg-[#0000FF] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"} disabled:opacity-60`}
                data-testid="map-mode-profile"
              >
                {geocoding ? "Locating…" : "Profile Address"}
              </button>
            </div>
          </div>
        )}

        {/* State selector — top-left (shifted down when segmented control is visible) */}
        <div className={`absolute ${profileAddress ? "top-12" : "top-3"} left-3 pointer-events-auto`}>
          <select
            value={selectedState}
            onChange={handleStateSelect}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-md focus:outline-none focus:border-[#0000FF] cursor-pointer max-w-[140px]"
            data-testid="state-selector"
          >
            <option value="">Jump to state...</option>
            {US_STATES.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Locate + Rotation — top-right */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 pointer-events-auto">

          {/* Locate button */}
          <button
            onClick={handleLocate}
            disabled={locating}
            title="Go to my location"
            className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#0000FF] shadow-md hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
            data-testid="locate-btn"
          >
            {locating ? (
              <div className="w-3.5 h-3.5 border-2 border-[#0000FF] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
              </svg>
            )}
            {locating ? "Locating…" : "Locate"}
          </button>

          {/* Rotation control */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden flex items-center">
            <button
              onClick={rotateCCW}
              title="Rotate counterclockwise 45°"
              className="px-2.5 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
              data-testid="rotate-ccw-btn"
            >
              ↺
            </button>
            <button
              onClick={resetNorth}
              title={bearing === 0 ? "North up" : `${bearing}° — click to reset`}
              className="px-2 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-[#0000FF] hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors border-x border-slate-200 dark:border-slate-700 min-w-[38px] text-center tabular-nums"
              data-testid="reset-north-btn"
            >
              {bearing === 0 ? "N" : `${bearing}°`}
            </button>
            <button
              onClick={rotateCW}
              title="Rotate clockwise 45°"
              className="px-2.5 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
              data-testid="rotate-cw-btn"
            >
              ↻
            </button>
          </div>
        </div>

        {/* North indicator — visible when bearing ≠ 0 */}
        {bearing !== 0 && (
          <div className="absolute bottom-12 left-3 pointer-events-none">
            <div
              className="w-8 h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full shadow-md flex items-center justify-center"
              title={`Map rotated ${bearing}°`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-5 h-5"
                style={{ transform: `rotate(${-bearing}deg)`, transition: "transform 0.35s ease" }}
              >
                <path d="M12 2L8 10h8L12 2z" fill="#EF4444" />
                <path d="M12 22L16 14H8l4 8z" fill="#94a3b8" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
