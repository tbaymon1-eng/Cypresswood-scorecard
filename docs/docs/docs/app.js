/* Mobile Scorecard – 18 holes, 6 players
   Overlay is generated from a computed box_map based on slider calibration.
*/

const PLAYERS = 6;

// Columns: 1-9, OUT, 10-18, IN, TOTAL  => 21 columns
const COLS = [
  ...Array.from({ length: 9 }, (_, i) => String(i + 1)),
  "OUT",
  ...Array.from({ length: 9 }, (_, i) => String(i + 10)),
  "IN",
  "TOT"
];

const overlay = document.getElementById("overlay");
const saveBtn = document.getElementById("saveBtn");
const exportArea = document.getElementById("exportArea");
const toggleSettingsBtn = document.getElementById("toggleSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const settingsPanel = document.getElementById("settingsPanel");

const toggleBoxesBtn = document.getElementById("toggleBoxesBtn");
const copyBoxMapBtn = document.getElementById("copyBoxMapBtn");
const resetBtn = document.getElementById("resetBtn");
const boxMapOutput = document.getElementById("boxMapOutput");

const sliders = {
  startX: document.getElementById("startX"),
  startY: document.getElementById("startY"),
  cellW: document.getElementById("cellW"),
  cellH: document.getElementById("cellH"),
  colGap: document.getElementById("colGap"),
  rowGap: document.getElementById("rowGap"),
};

const sliderVals = {
  startXVal: document.getElementById("startXVal"),
  startYVal: document.getElementById("startYVal"),
  cellWVal: document.getElementById("cellWVal"),
  cellHVal: document.getElementById("cellHVal"),
  colGapVal: document.getElementById("colGapVal"),
  rowGapVal: document.getElementById("rowGapVal"),
};

const DEFAULTS = {
  // These are starter guesses. You will dial them in using Align sliders.
  startX: 6.30,   // %
  startY: 36.50,  // %
  cellW: 4.05,    // %
  cellH: 4.75,    // %
  colGap: 0.35,   // %
  rowGap: 0.55,   // %
};

// localStorage keys
const LS_KEY_SETTINGS = "cw_scorecard_settings_v1";
const LS_KEY_SCORES   = "cw_scorecard_scores_v1";
const LS_KEY_BORDERS  = "cw_scorecard_borders_v1";

let showBorders = (localStorage.getItem(LS_KEY_BORDERS) === "1");
let settings = loadSettings();
let scores = loadScores();

function loadSettings(){
  try{
    const raw = localStorage.getItem(LS_KEY_SETTINGS);
    if(!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  }catch{
    return { ...DEFAULTS };
  }
}
function saveSettings(){
  localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(settings));
}

function loadScores(){
  try{
    const raw = localStorage.getItem(LS_KEY_SCORES);
    if(!raw){
      // init empty
      const obj = {};
      for(let p=1;p<=PLAYERS;p++){
        for(let h=1;h<=18;h++){
          obj[`p${p}_h${h}`] = "";
        }
      }
      return obj;
    }
    return JSON.parse(raw);
  }catch{
    return {};
  }
}
function saveScores(){
  localStorage.setItem(LS_KEY_SCORES, JSON.stringify(scores));
}

function pct(n){ return `${n}%`; }

function computeBoxMap(){
  // Returns boxes in percentage units relative to stage.
  // 6 rows (players), 21 cols (1-9,OUT,10-18,IN,TOT)
  const map = [];

  const { startX, startY, cellW, cellH, colGap, rowGap } = settings;

  for(let p=1; p<=PLAYERS; p++){
    for(let c=0; c<COLS.length; c++){
      const colName = COLS[c];

      const left = startX + c * (cellW + colGap);
      const top  = startY + (p-1) * (cellH + rowGap);

      // Keys:
      // - hole fields: p{p}_h{n}
      // - totals: p{p}_out, p{p}_in, p{p}_tot
      let key = "";
      if(colName === "OUT") key = `p${p}_out`;
      else if(colName === "IN") key = `p${p}_in`;
      else if(colName === "TOT") key = `p${p}_tot`;
      else {
        const h = parseInt(colName, 10);
        key = `p${p}_h${h}`;
      }

      map.push({
        key,
        player: p,
        col: colName,
        left, top,
        width: cellW,
        height: cellH
      });
    }
  }
  return map;
}

function render(){
  overlay.innerHTML = "";
  const boxMap = computeBoxMap();

  // Build inputs
  for(const box of boxMap){
    const div = document.createElement("div");
    div.className = "field" +
      ((box.col === "OUT" || box.col === "IN" || box.col === "TOT") ? " total" : "") +
      (showBorders ? " show-border" : "");
    div.style.left = pct(box.left);
    div.style.top = pct(box.top);
    div.style.width = pct(box.width);
    div.style.height = pct(box.height);

    const input = document.createElement("input");
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    input.autocomplete = "off";
    input.spellcheck = false;

    // totals are computed; lock input
    const isTotal = (box.col === "OUT" || box.col === "IN" || box.col === "TOT");
    input.readOnly = isTotal;

    // value
    if(isTotal){
      input.value = String(calcTotal(box.key) ?? "");
    }else{
      input.value = scores[box.key] ?? "";
    }

    input.addEventListener("input", (e)=>{
      const val = (e.target.value || "").replace(/[^\d]/g, "").slice(0, 2); // keep 0-99
      e.target.value = val;
      scores[box.key] = val;
      saveScores();
      // re-render totals
      refreshTotalsOnly();
    });

    div.appendChild(input);
    overlay.appendChild(div);
  }

  // update textarea output
  boxMapOutput.value = JSON.stringify({
    version: 1,
    players: PLAYERS,
    columns: COLS,
    settings,
    box_map: boxMap
  }, null, 2);

  updateSliderLabels();
}

function refreshTotalsOnly(){
  // Update all total inputs without full redraw
  const totalKeys = [];
  for(let p=1;p<=PLAYERS;p++){
    totalKeys.push(`p${p}_out`, `p${p}_in`, `p${p}_tot`);
  }

  // overlay children are in boxMap order; easiest: just re-render.
  // (Still fast on phones.)
  render();
}

function calcTotal(key){
  // key format is p{p}_out or p{p}_in or p{p}_tot
  const m = key.match(/^p(\d+)_(out|in|tot)$/);
  if(!m) return null;
  const p = parseInt(m[1], 10);
  const which = m[2];

  const sum = (from, to) => {
    let s = 0;
    let any = false;
    for(let h=from; h<=to; h++){
      const v = parseInt(scores[`p${p}_h${h}`] || "", 10);
      if(!Number.isNaN(v)){
        s += v; any = true;
      }
    }
    return any ? s : "";
  };

  const out = sum(1,9);
  const inn = sum(10,18);

  if(which === "out") return out;
  if(which === "in") return inn;

  // tot
  if(out === "" && inn === "") return "";
  return (out || 0) + (inn || 0);
}

function updateSliderLabels(){
  sliderVals.startXVal.textContent = settings.startX.toFixed(2) + "%";
  sliderVals.startYVal.textContent = settings.startY.toFixed(2) + "%";
  sliderVals.cellWVal.textContent  = settings.cellW.toFixed(2) + "%";
  sliderVals.cellHVal.textContent  = settings.cellH.toFixed(2) + "%";
  sliderVals.colGapVal.textContent = settings.colGap.toFixed(2) + "%";
  sliderVals.rowGapVal.textContent = settings.rowGap.toFixed(2) + "%";
}

function initSliders(){
  // Set initial slider values + listeners
  sliders.startX.value = settings.startX;
  sliders.startY.value = settings.startY;
  sliders.cellW.value  = settings.cellW;
  sliders.cellH.value  = settings.cellH;
  sliders.colGap.value = settings.colGap;
  sliders.rowGap.value = settings.rowGap;

  for(const [k, el] of Object.entries(sliders)){
    el.addEventListener("input", ()=>{
      settings[k] = parseFloat(el.value);
      saveSettings();
      render();
    });
  }
}

toggleSettingsBtn.addEventListener("click", ()=>{
  settingsPanel.classList.toggle("hidden");
});
closeSettingsBtn.addEventListener("click", ()=>{
  settingsPanel.classList.add("hidden");
});

toggleBoxesBtn.addEventListener("click", ()=>{
  showBorders = !showBorders;
  localStorage.setItem(LS_KEY_BORDERS, showBorders ? "1" : "0");
  render();
});

copyBoxMapBtn.addEventListener("click", async ()=>{
  try{
    await navigator.clipboard.writeText(boxMapOutput.value);
    alert("box_map JSON copied to clipboard ✅");
  }catch{
    // fallback: select text
    boxMapOutput.focus();
    boxMapOutput.select();
    alert("Select + Copy the JSON in the box (clipboard blocked).");
  }
});

resetBtn.addEventListener("click", ()=>{
  settings = { ...DEFAULTS };
  saveSettings();
  initSliders();
  render();
});

saveBtn.addEventListener("click", async ()=>{
  // Create a “flat” image of background + current overlay numbers.
  // iPhone flow: it opens the image -> Share -> Save Image
  try{
    // Temporarily force borders off in export (clean)
    const prevBorders = showBorders;
    showBorders = false;
    render();

    const canvas = await html2canvas(document.getElementById("scorecardStage"), {
      backgroundColor: null,
      scale: 2
    });

    // Restore borders
    showBorders = prevBorders;
    render();

    canvas.toBlob((blob)=>{
      if(!blob){
        alert("Could not generate image.");
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // User: Share -> Save Image
    }, "image/png");
  }catch(e){
    console.error(e);
    alert("Save failed. Try again (or refresh).");
  }
});

(function boot(){
  initSliders();
  render();
})();
