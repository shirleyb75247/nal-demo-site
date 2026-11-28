/* LED Savings Calculator logic. Source: energy-savings-src/led-savings-calculator.html
   Behavior unchanged; queries are scoped to the page root so the SPA can re-init on navigation. */
(function (global) {
  global.LED_SAVINGS_PAGE_HTML = "<section class=\"nal-savings\" aria-label=\"LED Savings Calculator\">\n<div class=\"wrap\">\n\n  <p class=\"eyebrow\">For distributors &amp; contractors</p>\n  <h1>LED Savings Calculator</h1>\n  <p class=\"lede\">Pick an LED fixture, and the fixture it replaces fills in automatically. Enter the daily run time and your electricity rate \u2014 <strong>you get the kWh and dollars saved per year</strong>, with the math shown step by step.</p>\n\n  <!-- Quick reference -->\n  <p class=\"section-label\">Quick reference</p>\n  <p class=\"section-note\">Per fixture, at 8 hrs/day \u00b7 $0.12 per kWh \u00b7 365 days/year. Tap a card to load it into the calculator.</p>\n  <div class=\"quick-grid\" id=\"quickGrid\">\n    <button type=\"button\" class=\"quick-card\" data-preset=\"tube18\">\n      <div class=\"qc-top\">18W \u00b7 4 ft LED Tube</div>\n      <div class=\"qc-vs\">replaces <span>2 \u00d7 36W fluorescent</span></div>\n      <div class=\"qc-save\">$18.92 <small>/ year</small></div>\n      <div class=\"qc-kwh\">157.7 kWh saved per year</div>\n    </button>\n    <button type=\"button\" class=\"quick-card\" data-preset=\"flood50\">\n      <div class=\"qc-top\">50W \u00b7 LED Flood Light</div>\n      <div class=\"qc-vs\">replaces <span>260W high-pressure sodium</span></div>\n      <div class=\"qc-save\">$73.58 <small>/ year</small></div>\n      <div class=\"qc-kwh\">613.2 kWh saved per year</div>\n    </button>\n    <button type=\"button\" class=\"quick-card\" data-preset=\"shoe150\">\n      <div class=\"qc-top\">150W \u00b7 LED Shoebox</div>\n      <div class=\"qc-vs\">replaces <span>400W metal halide</span></div>\n      <div class=\"qc-save\">$87.60 <small>/ year</small></div>\n      <div class=\"qc-kwh\">730 kWh saved per year</div>\n    </button>\n    <button type=\"button\" class=\"quick-card\" data-preset=\"shoe300\">\n      <div class=\"qc-top\">300W \u00b7 LED Shoebox</div>\n      <div class=\"qc-vs\">replaces <span>1,000W metal halide</span></div>\n      <div class=\"qc-save\">$245.28 <small>/ year</small></div>\n      <div class=\"qc-kwh\">2,044 kWh saved per year</div>\n    </button>\n  </div>\n\n  <!-- Calculator -->\n  <section class=\"calc\" aria-label=\"Savings calculator\">\n    <div class=\"calc-form\">\n      <h2>Calculate your savings</h2>\n      <p class=\"sub\">Changing the LED fixture updates the fixture it replaces. You can still adjust the replacement manually.</p>\n\n      <div class=\"arrow-row\">\n        <div class=\"field\">\n          <label for=\"ledSelect\">LED fixture</label>\n          <select id=\"ledSelect\">\n            <option value=\"tube18\" selected>18W \u2014 4 ft LED Tube</option>\n            <option value=\"flood50\">50W \u2014 LED Flood Light</option>\n            <option value=\"shoe150\">150W \u2014 LED Shoebox Light</option>\n            <option value=\"shoe300\">300W \u2014 LED Shoebox Light</option>\n            <option value=\"tube12\">12W \u2014 4 ft LED Tube</option>\n            <option value=\"highbay100\">100W \u2014 LED High Bay</option>\n            <option value=\"highbay200\">200W \u2014 LED High Bay</option>\n            <option value=\"custom\">Custom wattage\u2026</option>\n          </select>\n        </div>\n        <div class=\"swap-arrow\" aria-hidden=\"true\">\u2192</div>\n        <div class=\"field\">\n          <label for=\"legacySelect\">Replaces (existing fixture)</label>\n          <select id=\"legacySelect\">\n            <option value=\"fluor2x36\" selected>2 \u00d7 36W Fluorescent Tubes \u2014 72W total</option>\n            <option value=\"fluor36\">1 \u00d7 36W Fluorescent Tube \u2014 36W</option>\n            <option value=\"fluor2x58\">2 \u00d7 58W Fluorescent Tubes \u2014 116W total</option>\n            <option value=\"hps260\">260W High-Pressure Sodium</option>\n            <option value=\"hps400\">400W High-Pressure Sodium</option>\n            <option value=\"mh175\">175W Metal Halide</option>\n            <option value=\"mh250\">250W Metal Halide</option>\n            <option value=\"mh400\">400W Metal Halide</option>\n            <option value=\"mh1000\">1,000W Metal Halide</option>\n            <option value=\"custom\">Custom wattage\u2026</option>\n          </select>\n        </div>\n      </div>\n\n      <div class=\"grid-2\" id=\"customRow\" hidden>\n        <div class=\"field\">\n          <label for=\"customLedW\">LED wattage (W)</label>\n          <input type=\"number\" id=\"customLedW\" min=\"1\" max=\"2000\" step=\"1\" value=\"40\">\n        </div>\n        <div class=\"field\">\n          <label for=\"customLegacyW\">Existing wattage (W)</label>\n          <input type=\"number\" id=\"customLegacyW\" min=\"1\" max=\"3000\" step=\"1\" value=\"150\">\n        </div>\n      </div>\n\n      <div class=\"field\">\n        <label for=\"hoursRange\">Hours of use per day</label>\n        <div class=\"range-row\">\n          <input type=\"range\" id=\"hoursRange\" min=\"1\" max=\"24\" step=\"0.5\" value=\"8\" aria-label=\"Hours per day slider\">\n          <input type=\"number\" id=\"hoursInput\" min=\"0.5\" max=\"24\" step=\"0.5\" value=\"8\" aria-label=\"Hours per day\">\n        </div>\n        <div class=\"hint\">Warehouses and retail typically run 10\u201316 hrs/day; outdoor area lighting about 12 hrs/day (dusk to dawn).</div>\n      </div>\n\n      <div class=\"grid-2\">\n        <div class=\"field\">\n          <label for=\"rateInput\">Electricity rate (\u00a2 per kWh)</label>\n          <input type=\"number\" id=\"rateInput\" min=\"1\" max=\"100\" step=\"0.1\" value=\"12\">\n          <div class=\"hint\">Default 12\u00a2 \u2014 the U.S. commercial average is roughly 12\u201313\u00a2/kWh.</div>\n        </div>\n        <div class=\"field\">\n          <label for=\"qtyInput\">Number of fixtures</label>\n          <input type=\"number\" id=\"qtyInput\" min=\"1\" max=\"100000\" step=\"1\" value=\"1\">\n          <div class=\"hint\">Results on the right are for all fixtures combined.</div>\n        </div>\n      </div>\n\n      <details class=\"advanced\">\n        <summary>More options \u2014 days per year &amp; payback</summary>\n        <div class=\"grid-2\">\n          <div class=\"field\">\n            <label for=\"daysInput\">Days per year</label>\n            <input type=\"number\" id=\"daysInput\" min=\"1\" max=\"365\" step=\"1\" value=\"365\">\n          </div>\n          <div class=\"field\">\n            <label for=\"priceInput\">LED price per fixture ($, optional)</label>\n            <input type=\"number\" id=\"priceInput\" min=\"0\" max=\"10000\" step=\"0.01\" placeholder=\"e.g. 25.00\">\n            <div class=\"hint\">Fill this in to see the payback period.</div>\n          </div>\n        </div>\n      </details>\n    </div>\n\n    <div class=\"calc-results\" aria-live=\"polite\">\n      <h2>Your savings</h2>\n      <p class=\"sub\" id=\"resultContext\">1 fixture \u00b7 8 hrs/day \u00b7 365 days/year</p>\n\n      <div class=\"result-hero\">\n        <div class=\"r-label\">Saved per year</div>\n        <div class=\"r-value\" id=\"annualMoney\">$18.92</div>\n        <div class=\"r-sub\"><strong id=\"annualKwh\">157.7 kWh</strong> of electricity saved per year</div>\n      </div>\n\n      <div class=\"r-grid\">\n        <div class=\"r-item\">\n          <div class=\"r-label\">Watts saved</div>\n          <div class=\"r-num\" id=\"wattsSaved\">54 W</div>\n          <div class=\"r-note\" id=\"wattsSavedNote\">per fixture</div>\n        </div>\n        <div class=\"r-item\">\n          <div class=\"r-label\">Saved per month</div>\n          <div class=\"r-num\" id=\"monthlyMoney\">$1.58</div>\n          <div class=\"r-note\" id=\"monthlyKwh\">13.1 kWh</div>\n        </div>\n        <div class=\"r-item\">\n          <div class=\"r-label\">5-year savings</div>\n          <div class=\"r-num\" id=\"fiveYear\">$94.61</div>\n          <div class=\"r-note\" id=\"fiveYearKwh\">788.4 kWh</div>\n        </div>\n        <div class=\"r-item\">\n          <div class=\"r-label\">10-year savings</div>\n          <div class=\"r-num\" id=\"tenYear\">$189.22</div>\n          <div class=\"r-note\" id=\"tenYearKwh\">1,577 kWh</div>\n        </div>\n        <div class=\"r-item\">\n          <div class=\"r-label\">Old annual cost</div>\n          <div class=\"r-num\" id=\"oldCost\">$25.23</div>\n          <div class=\"r-note\">electricity only</div>\n        </div>\n        <div class=\"r-item\">\n          <div class=\"r-label\">New annual cost</div>\n          <div class=\"r-num\" id=\"newCost\">$6.31</div>\n          <div class=\"r-note\">electricity only</div>\n        </div>\n      </div>\n\n      <div class=\"r-item\" id=\"paybackItem\" style=\"margin-top:18px\" hidden>\n        <div class=\"r-label\">Payback period</div>\n        <div class=\"r-num\" id=\"paybackValue\">\u2014</div>\n        <div class=\"r-note\">Based on the LED price you entered, energy savings only.</div>\n      </div>\n\n      <div class=\"compare\">\n        <div class=\"r-label\">Power draw compared</div>\n        <div class=\"bar-row\">\n          <span id=\"oldBarLabel\">Existing</span>\n          <div class=\"bar-track\"><div class=\"bar-fill old\" id=\"oldBar\" style=\"width:100%\"></div></div>\n          <span class=\"bar-val\" id=\"oldBarVal\">72W</span>\n        </div>\n        <div class=\"bar-row\">\n          <span>LED</span>\n          <div class=\"bar-track\"><div class=\"bar-fill new\" id=\"newBar\" style=\"width:25%\"></div></div>\n          <span class=\"bar-val\" id=\"newBarVal\">18W</span>\n        </div>\n        <p class=\"pct-note\" id=\"pctNote\">The LED uses <strong>75% less power</strong> for the same job.</p>\n      </div>\n    </div>\n  </section>\n\n  <!-- Formula -->\n  <section class=\"formula-box\" aria-label=\"Formula\">\n    <h2>The formula, with your numbers</h2>\n    <p class=\"sub\">Every figure above comes from these three lines \u2014 nothing else is added in.</p>\n    <div class=\"formula-line\" id=\"formula1\">(72W \u2212 18W) \u00d7 8 hrs \u00d7 365 days \u00f7 1,000 = <span class=\"res\">157.7 kWh / year</span></div>\n    <div class=\"formula-line\" id=\"formula2\">157.7 kWh \u00d7 $0.12 per kWh = <span class=\"res\">$18.92 / year</span></div>\n    <div class=\"formula-line\" id=\"formula3\">$18.92 \u00d7 1 fixture = <span class=\"res\">$18.92 total per year</span></div>\n    <p class=\"unit-note\" style=\"margin-top:12px\">General form: &nbsp;<b>(Existing watts \u2212 LED watts) \u00d7 hours/day \u00d7 days/year \u00f7 1,000 = kWh saved</b>, then <b>kWh \u00d7 rate = dollars saved</b>. One kilowatt-hour (kWh) is 1,000 watts running for one hour \u2014 that is the unit your utility bill charges for.</p>\n  </section>\n\n  <section class=\"note-box\">\n    <h3>A note on ballasts \u2014 these numbers are conservative</h3>\n    <p>The calculation uses the lamp wattages printed on the fixtures. In practice, fluorescent, high-pressure sodium, and metal halide fixtures also draw power through a ballast, so the existing fixture usually pulls more than its nameplate watts \u2014 a 400W metal halide system typically draws about 458W, and a 1,000W system about 1,080W. Your real savings will generally be higher than the figures shown here.</p>\n    <p>Maintenance savings are not included either: LED fixtures typically last 50,000 hours or more, so relamping and ballast-replacement costs on the old fixtures disappear as well.</p>\n  </section>\n\n  <footer>LED Savings Calculator \u00b7 Estimates based on nameplate wattage and the rate you enter. Actual results vary with fixture, ballast, and local utility rates.</footer>\n</div>\n</section>";

  global.initLedSavingsCalculator = function (root) {
    root = root || document.querySelector(".nal-savings");
    if (!root || !root.querySelector("#ledSelect")) return;

var LED = {
    tube18:{w:18, legacy:'fluor2x36', label:'18W 4 ft LED Tube'},
    flood50:{w:50, legacy:'hps260', label:'50W LED Flood Light'},
    shoe150:{w:150, legacy:'mh400', label:'150W LED Shoebox'},
    shoe300:{w:300, legacy:'mh1000', label:'300W LED Shoebox'},
    tube12:{w:12, legacy:'fluor36', label:'12W 4 ft LED Tube'},
    highbay100:{w:100, legacy:'mh250', label:'100W LED High Bay'},
    highbay200:{w:200, legacy:'mh400', label:'200W LED High Bay'},
    custom:{w:null, legacy:'custom', label:'Custom LED'}
  };
  var LEGACY = {
    fluor2x36:{w:72, short:'2 × 36W fluorescent'},
    fluor36:{w:36, short:'36W fluorescent'},
    fluor2x58:{w:116, short:'2 × 58W fluorescent'},
    hps260:{w:260, short:'260W HPS'},
    hps400:{w:400, short:'400W HPS'},
    mh175:{w:175, short:'175W metal halide'},
    mh250:{w:250, short:'250W metal halide'},
    mh400:{w:400, short:'400W metal halide'},
    mh1000:{w:1000, short:'1,000W metal halide'},
    custom:{w:null, short:'custom fixture'}
  };

  var ledSelect = root.querySelector('#ledSelect');
  var legacySelect = root.querySelector('#legacySelect');
  var customRow = root.querySelector('#customRow');
  var customLedW = root.querySelector('#customLedW');
  var customLegacyW = root.querySelector('#customLegacyW');
  var hoursRange = root.querySelector('#hoursRange');
  var hoursInput = root.querySelector('#hoursInput');
  var rateInput = root.querySelector('#rateInput');
  var qtyInput = root.querySelector('#qtyInput');
  var daysInput = root.querySelector('#daysInput');
  var priceInput = root.querySelector('#priceInput');

  function fmtInt(n){ return Math.round(n).toLocaleString('en-US'); }
  function fmtKwh(n){
    if(n >= 1000) return fmtInt(n);
    return (Math.round(n*10)/10).toLocaleString('en-US');
  }
  function fmtMoney(n){
    return '$' + n.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function num(el, fallback){
    var v = parseFloat(el.value);
    return isNaN(v) ? fallback : v;
  }

  function syncCustomVisibility(){
    var show = (ledSelect.value === 'custom' || legacySelect.value === 'custom');
    customRow.hidden = !show;
    root.querySelector('label[for="customLedW"]').parentElement.style.display = (ledSelect.value === 'custom') ? '' : 'none';
    root.querySelector('label[for="customLegacyW"]').parentElement.style.display = (legacySelect.value === 'custom') ? '' : 'none';
  }

  function markActiveCard(){
    var cards = root.querySelectorAll('.quick-card');
    for(var i=0;i<cards.length;i++){
      cards[i].classList.toggle('active', cards[i].getAttribute('data-preset') === ledSelect.value);
    }
  }

  function calculate(){
    syncCustomVisibility();
    markActiveCard();

    var ledW = (ledSelect.value === 'custom') ? num(customLedW, 40) : LED[ledSelect.value].w;
    var legacyW = (legacySelect.value === 'custom') ? num(customLegacyW, 150) : LEGACY[legacySelect.value].w;
    var hours = Math.min(24, Math.max(0, num(hoursInput, 8)));
    var rate = num(rateInput, 12) / 100; /* cents -> dollars */
    var qty = Math.max(1, Math.round(num(qtyInput, 1)));
    var days = Math.min(365, Math.max(1, num(daysInput, 365)));
    var price = num(priceInput, 0);

    var savedW = legacyW - ledW;
    var kwhPerFixture = savedW * hours * days / 1000;
    var totalKwh = kwhPerFixture * qty;
    var annual = totalKwh * rate;
    var oldKwh = legacyW * hours * days / 1000 * qty;
    var newKwh = ledW * hours * days / 1000 * qty;

    root.querySelector('#resultContext').textContent =
      qty.toLocaleString('en-US') + (qty === 1 ? ' fixture' : ' fixtures') + ' · ' +
      (hours % 1 === 0 ? hours.toFixed(0) : hours) + ' hrs/day · ' + days + ' days/year';

    root.querySelector('#annualMoney').textContent = fmtMoney(Math.max(0, annual));
    root.querySelector('#annualKwh').textContent = fmtKwh(Math.max(0, totalKwh)) + ' kWh';
    root.querySelector('#wattsSaved').textContent = fmtInt(savedW) + ' W';
    root.querySelector('#wattsSavedNote').textContent = 'per fixture · ' + fmtInt(legacyW) + 'W → ' + fmtInt(ledW) + 'W';
    root.querySelector('#monthlyMoney').textContent = fmtMoney(Math.max(0, annual) / 12);
    root.querySelector('#monthlyKwh').textContent = fmtKwh(Math.max(0, totalKwh) / 12) + ' kWh';
    root.querySelector('#fiveYear').textContent = fmtMoney(Math.max(0, annual) * 5);
    root.querySelector('#fiveYearKwh').textContent = fmtKwh(Math.max(0, totalKwh) * 5) + ' kWh';
    root.querySelector('#tenYear').textContent = fmtMoney(Math.max(0, annual) * 10);
    root.querySelector('#tenYearKwh').textContent = fmtKwh(Math.max(0, totalKwh) * 10) + ' kWh';
    root.querySelector('#oldCost').textContent = fmtMoney(oldKwh * rate);
    root.querySelector('#newCost').textContent = fmtMoney(newKwh * rate);

    /* Payback */
    var paybackItem = root.querySelector('#paybackItem');
    if(price > 0 && annual > 0){
      paybackItem.hidden = false;
      var months = (price * qty) / annual * 12;
      var txt;
      if(months < 1) txt = 'Under 1 month';
      else if(months < 12) txt = (Math.round(months*10)/10) + ' months';
      else txt = (Math.round(months/12*10)/10) + ' years (' + fmtInt(months) + ' months)';
      root.querySelector('#paybackValue').textContent = txt;
    } else {
      paybackItem.hidden = true;
    }

    /* Bars */
    var maxW = Math.max(legacyW, ledW, 1);
    root.querySelector('#oldBar').style.width = (legacyW / maxW * 100) + '%';
    root.querySelector('#newBar').style.width = Math.max(2, ledW / maxW * 100) + '%';
    root.querySelector('#oldBarVal').textContent = fmtInt(legacyW) + 'W';
    root.querySelector('#newBarVal').textContent = fmtInt(ledW) + 'W';
    var pct = legacyW > 0 ? Math.round((1 - ledW / legacyW) * 100) : 0;
    root.querySelector('#pctNote').innerHTML = 'The LED uses <strong>' + pct + '% less power</strong> for the same job.';

    /* Formula lines */
    root.querySelector('#formula1').innerHTML =
      '(' + fmtInt(legacyW) + 'W − ' + fmtInt(ledW) + 'W) × ' + (hours % 1 === 0 ? hours.toFixed(0) : hours) +
      ' hrs × ' + days + ' days ÷ 1,000 = <span class="res">' + fmtKwh(kwhPerFixture) + ' kWh / year per fixture</span>';
    root.querySelector('#formula2').innerHTML =
      fmtKwh(kwhPerFixture) + ' kWh × $' + rate.toFixed(2).replace(/0$/, '') + ' per kWh = <span class="res">' +
      fmtMoney(kwhPerFixture * rate) + ' / year per fixture</span>';
    root.querySelector('#formula3').innerHTML =
      fmtMoney(kwhPerFixture * rate) + ' × ' + qty.toLocaleString('en-US') + (qty === 1 ? ' fixture' : ' fixtures') +
      ' = <span class="res">' + fmtMoney(annual) + ' total per year</span>';
  }

  ledSelect.addEventListener('change', function(){
    var preset = LED[ledSelect.value];
    if(preset && preset.legacy){
      legacySelect.value = preset.legacy;
      if(preset.legacy === 'custom' && preset.w){
        /* keep custom legacy field as-is */
      }
    }
    if(ledSelect.value === 'custom'){
      legacySelect.value = 'custom';
    }
    calculate();
  });
  legacySelect.addEventListener('change', calculate);
  customLedW.addEventListener('input', calculate);
  customLegacyW.addEventListener('input', calculate);
  hoursRange.addEventListener('input', function(){ hoursInput.value = hoursRange.value; calculate(); });
  hoursInput.addEventListener('input', function(){
    var v = num(hoursInput, 8);
    if(v >= 1 && v <= 24) hoursRange.value = v;
    calculate();
  });
  rateInput.addEventListener('input', calculate);
  qtyInput.addEventListener('input', calculate);
  daysInput.addEventListener('input', calculate);
  priceInput.addEventListener('input', calculate);

  var cards = root.querySelectorAll('.quick-card');
  for(var i=0;i<cards.length;i++){
    cards[i].addEventListener('click', function(){
      var key = this.getAttribute('data-preset');
      ledSelect.value = key;
      legacySelect.value = LED[key].legacy;
      hoursInput.value = 8; hoursRange.value = 8;
      rateInput.value = 12; qtyInput.value = 1; daysInput.value = 365;
      calculate();
      root.querySelector('.calc').scrollIntoView({behavior:'smooth', block:'start'});
    });
  }

  calculate();

  };
})(window);
