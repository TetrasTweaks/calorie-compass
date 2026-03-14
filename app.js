const { useEffect, useMemo, useState } = React;

const LOG_KEY = "calorie_logs";
const FAV_KEY = "calorie_favorites";
const THEME_KEY = "calorie_theme";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getStored = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
};

const setStored = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatCalories = (value) => Math.round(value);

const buildFoodItem = (product) => {
  const nutriments = product.nutriments || {};
  const kcalServing = parseFloat(nutriments["energy-kcal_serving"]);
  const kcal100g = parseFloat(nutriments["energy-kcal_100g"]);
  const caloriesPerServing = Number.isFinite(kcalServing)
    ? kcalServing
    : Number.isFinite(kcal100g)
    ? kcal100g
    : null;

  if (!Number.isFinite(caloriesPerServing)) {
    return null;
  }

  const servingSizeRaw = product.serving_size || "";
  const hasServing = Boolean(servingSizeRaw && kcalServing);
  const servingSize = hasServing
    ? servingSizeRaw
    : kcalServing
    ? "1 serving"
    : "100 g";

  return {
    id: product.code || `${product._id || product.product_name}-${Math.random()}`,
    name: product.product_name || "Unnamed item",
    brand: product.brands || "",
    caloriesPerServing,
    servingSize,
    image: product.image_small_url || "",
    source: hasServing ? "per serving" : "per 100 g",
  };
};

const App = () => {
  const [activeTab, setActiveTab] = useState("home");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [servings, setServings] = useState(1);
  const [logs, setLogs] = useState(() => getStored(LOG_KEY, []));
  const [favorites, setFavorites] = useState(() => getStored(FAV_KEY, []));
  const [theme, setTheme] = useState(() => getStored(THEME_KEY, "light"));

  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
    setStored(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    setStored(LOG_KEY, logs);
  }, [logs]);

  useEffect(() => {
    setStored(FAV_KEY, favorites);
  }, [favorites]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
          query
        )}&search_simple=1&action=process&json=1&page_size=20`;
        const response = await fetch(url, { signal: controller.signal });
        const data = await response.json();
          const items = (data.products || [])
              .filter(p => p.lang === "en")
              .map(buildFoodItem)
              .filter(Boolean);
        setResults(items);
      } catch (err) {
        if (err.name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const todaysKey = toDateKey(new Date());

  const todaysLogs = useMemo(() => {
    return logs.filter((log) => log.dateKey === todaysKey);
  }, [logs, todaysKey]);

  const todayTotal = useMemo(() => {
    return todaysLogs.reduce((sum, log) => sum + log.calories, 0);
  }, [todaysLogs]);

  const weeklyTotals = useMemo(() => {
    const totals = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = toDateKey(date);
      const total = logs
        .filter((log) => log.dateKey === key)
        .reduce((sum, log) => sum + log.calories, 0);
      totals.push({
        label: dayLabels[date.getDay()],
        key,
        total,
      });
    }
    return totals;
  }, [logs]);

  const maxWeekly = Math.max(1, ...weeklyTotals.map((day) => day.total));

  const servingsOptions = Array.from({ length: 10 }, (_, i) => i + 1);

  const handleSelect = (item) => {
    setSelected(item);
    setServings(1);
  };

  const handleAddLog = () => {
    if (!selected) return;
    const totalCalories = selected.caloriesPerServing * servings;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: selected.name,
      brand: selected.brand,
      calories: totalCalories,
      servings,
      timestamp: new Date().toISOString(),
      dateKey: toDateKey(new Date()),
    };
    setLogs([entry, ...logs]);
  };

  const handleDeleteLog = (id) => {
    setLogs(logs.filter((log) => log.id !== id));
  };

  const handleSaveFavorite = () => {
    if (!selected) return;
    const exists = favorites.some((fav) => fav.id === selected.id);
    if (!exists) {
      setFavorites([selected, ...favorites]);
    }
  };

  const handleSelectFavorite = (fav) => {
    setSelected(fav);
    setServings(1);
    setActiveTab("home");
  };

  const isFavorite = selected && favorites.some((fav) => fav.id === selected.id);

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <h1>Calorie Compass</h1>
          <small>Search, track, and stay on course</small>
        </div>
        <button className="toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle dark mode">
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </div>

      {activeTab === "home" && (
        <div className="grid">
          <div className="card">
            <div className="search">
              <div className="section-title">
                <h2>Food search</h2>
                <span className="badge">Live lookup</span>
              </div>
              <input
                type="text"
                placeholder="Search foods or brands"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {loading && <div className="empty">Searching for matches...</div>}
              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <div className="empty">No matches yet. Try a different keyword.</div>
              )}
              <div className="search-results">
                {results.map((item) => (
                  <div
                    key={item.id}
                    className="search-item"
                    onClick={() => handleSelect(item)}
                  >
                        {item.image && (
                            <img
                                src={item.image}
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    objectFit: "cover",
                                    borderRadius: "8px",
                                    marginRight: "10px"
                                }}
                            />
                        )}

                        <div>
                      <div>{item.name}</div>
                      <small>{item.brand || "Generic"}</small>
                    </div>
                    <div className="pill">
                      {formatCalories(item.caloriesPerServing)} kcal {item.source}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="detail">
              <div className="section-title">
                <h2>Selected food</h2>
                <span className="tag">{selected ? "Ready to log" : "Pick an item"}</span>
              </div>

              {selected ? (
                <>
                  <h3>{selected.name}</h3>
                  <div className="tag">{selected.brand || "No brand listed"}</div>
                  <div className="detail-row">
                    <div>
                      <div className="tag">Calories per serving</div>
                      <div>{formatCalories(selected.caloriesPerServing)} kcal</div>
                    </div>
                    <div>
                      <div className="tag">Serving size</div>
                      <div>{selected.servingSize}</div>
                    </div>
                  </div>
                  <div className="detail-row">
                    <div>
                      <div className="tag">Servings</div>
                      <select
                        className="select"
                        value={servings}
                        onChange={(event) => setServings(Number(event.target.value))}
                      >
                        {servingsOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="tag">Total calories</div>
                      <div>{formatCalories(selected.caloriesPerServing * servings)} kcal</div>
                    </div>
                  </div>
                  <div className="actions">
                    <button className="button" onClick={handleAddLog}>
                      Add to today
                    </button>
                    <button
                      className="button secondary"
                      onClick={handleSaveFavorite}
                      disabled={isFavorite}
                    >
                      {isFavorite ? "Saved" : "Save food"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty">Search for a food to see serving details.</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              <h2>Today</h2>
              <span className="badge">{formatCalories(todayTotal)} kcal</span>
            </div>
            <div className="kpi">
              <span>Running total</span>
              <strong>{formatCalories(todayTotal)} kcal</strong>
            </div>
            <div className="log-list" style={{ marginTop: "16px" }}>
              {todaysLogs.length === 0 && (
                <div className="empty">No foods logged yet. Add your first item.</div>
              )}
              {todaysLogs.map((log) => (
                <div key={log.id} className="log-item">
                  <div>
                    <div>{log.name}</div>
                    <small>
                      {log.brand || "Generic"} · {log.servings} serving{log.servings > 1 ? "s" : ""}
                    </small>
                  </div>
                  <div className="actions">
                    <span>{formatCalories(log.calories)} kcal</span>
                    <button
                      className="button secondary"
                      onClick={() => handleDeleteLog(log.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              <h2>Saved foods</h2>
              <span className="badge">{favorites.length}</span>
            </div>
            {favorites.length === 0 ? (
              <div className="empty">Save favorites for faster logging.</div>
            ) : (
              <div className="log-list">
                {favorites.map((fav) => (
                  <div key={fav.id} className="log-item">
                    <div>
                      <div>{fav.name}</div>
                      <small>{fav.brand || "Generic"}</small>
                    </div>
                    <button className="button secondary" onClick={() => handleSelectFavorite(fav)}>
                      Use
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "weekly" && (
        <div className="card">
          <div className="section-title">
            <h2>Weekly intake</h2>
            <span className="badge">Last 7 days</span>
          </div>
          <div className="weekly">
            {weeklyTotals.map((day) => (
              <div key={day.key} className="week-row">
                <span>{day.label}</span>
                <div className="bar">
                  <span style={{ width: `${(day.total / maxWeekly) * 100}%` }}></span>
                </div>
                <strong>{formatCalories(day.total)} kcal</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="nav">
        <button
          className={activeTab === "home" ? "active" : ""}
          onClick={() => setActiveTab("home")}
        >
          Home
        </button>
        <button
          className={activeTab === "weekly" ? "active" : ""}
          onClick={() => setActiveTab("weekly")}
        >
          Weekly intake
        </button>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
