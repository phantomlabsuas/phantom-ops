class Component extends DCLogic {
  componentDidMount() {
    var self = this;
    this._t0 = Date.now();
    this._iv = setInterval(function () {
      self.setState({ t: Math.floor((Date.now() - self._t0) / 1000) });
    }, 1000);
  }
  componentWillUnmount() {
    clearInterval(this._iv);
    clearTimeout(this._c1); clearTimeout(this._c2); clearTimeout(this._arm);
  }
  runCmd(label, after) {
    var self = this;
    clearTimeout(this._c1); clearTimeout(this._c2);
    this.setState({ cmd: { label: label, step: 1 } });
    this._c1 = setTimeout(function () { self.setState({ cmd: { label: label, step: 2 } }); }, 700);
    this._c2 = setTimeout(function () {
      var p = after ? after() : {};
      p.cmd = { label: label, step: 3 };
      self.setState(p);
    }, 1900);
  }
  renderVals() {
    var self = this;
    var st = this.state || {};
    var t = st.t || 0;
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    function hms(s) { s = Math.max(0, s); return Math.floor(s / 3600) + ':' + p2(Math.floor(s % 3600 / 60)) + ':' + p2(s % 60); }
    function hm(s) { s = Math.max(0, s); return Math.floor(s / 3600) + ':' + p2(Math.floor(s % 3600 / 60)); }

    // --- picture-in-picture
    var corner = st.corner || this.props.pipCorner || 'bl';
    var swapped = !!st.swapped;
    var pos = { tl: 'left: 72px; top: 80px;', tr: 'left: 1024px; top: 80px;', bl: 'left: 72px; top: 704px;', br: 'left: 1024px; top: 704px;' };
    var nextC = { tl: 'tr', tr: 'br', br: 'bl', bl: 'tl' };
    var sqOn = 'background: #F2F4F6;', sqOff = 'background: transparent;';

    // --- simulated telemetry (1 Hz)
    var rpm = Math.round(5420 + 18 * Math.sin(t * 0.9) + 7 * Math.sin(t * 2.3));
    var cht1 = 231 + 0.3 * Math.sin(t / 9);
    var cht2 = 242 + 0.4 * Math.sin(t / 7);
    var egt = 712 + 3 * Math.sin(t / 5);
    var fuel = 11.4 - t * 0.000667;
    var bingoSec = 3 * 3600 + 12 * 60 - t;
    var flightSec = 9 * 3600 + 12 * 60 + 40 + t;
    var ias = st.ias || 27;
    var alt = st.alt || 1250;
    var spdT = st.spdT || ias;
    var altT = st.altT || alt;
    var pending = spdT !== ias || altT !== alt;
    var mode = st.mode || 'AUTO · LOITER';
    var hdg = Math.round(4 + t * 1.18) % 360;
    var c1H = cht1 - 150, c2H = cht2 - 150, egH = (egt - 500) * 120 / 350;
    var tankH = 176 * fuel / 42;
    var cmd = st.cmd || { label: 'ALT 1250 m', step: 3 };
    var armed = st.armed || null;
    var acked = !!st.acked;
    var panel = st.panel || null;

    // --- styles
    var stepOn = 'background: #E4E8EC; color: #0B0E11;';
    var stepOff = 'border: 1px solid #2A333C; color: #6B7580;';
    var navOn = 'border: 1px solid #3A4550; background: #1E262E; color: #E4E8EC;';
    var navOff = 'border: 1px solid transparent; background: transparent; color: #8A949E;';
    var tabOn = 'background: #E4E8EC; color: #0B0E11;';
    var tabOff = 'background: transparent; color: #A9B2BB;';
    var boxOn = 'background: #E4E8EC; border-color: #E4E8EC; color: #0B0E11;';
    var boxOff = 'color: transparent;';
    var bigBase = 'border: 1px solid #4A5560; background: #161C22;';
    var bigArmed = 'border: 2px solid #F2F4F6; background: #2A333C;';
    var bigActive = 'border: 1px solid #E4E8EC; background: #1E262E;';

    // --- menu
    var menu = st.menu || 'fly';
    var titles = { plan: 'PLAN', payload: 'PAYLOAD', check: 'CHECKLISTS', sys: 'ENGINE & SYSTEMS', log: 'EVENT LOG', hand: 'SHIFT HANDOVER' };
    function go(m) { return function () { self.setState({ menu: (st.menu === m || m === 'fly') ? 'fly' : m }); }; }

    // --- checklist
    var ck = st.ck || {};
    var nMan = (ck.m1 ? 1 : 0) + (ck.m2 ? 1 : 0) + (ck.m3 ? 1 : 0) + (ck.m4 ? 1 : 0);
    var ready = nMan === 4;
    var btArmed = !!st.btArmed && ready;
    var ckTab = st.ckTab || 'land';
    var tabNames = { pre: 'Pre-flight', cru: 'Cruise', land: 'Pre-landing', emg: 'Emergency' };
    function tick(k) { return function () { var n = {}; for (var key in ck) { n[key] = ck[key]; } n[k] = !ck[k]; self.setState({ ck: n }); }; }
    function tab(k) { return function () { self.setState({ ckTab: k }); }; }

    // --- two-step commands
    function twoStep(kind, newMode, label) {
      return function () {
        clearTimeout(self._arm);
        if ((self.state || {}).armed === kind) {
          self.setState({ armed: null });
          self.runCmd(label, function () { return { mode: newMode }; });
        } else {
          self.setState({ armed: kind });
          self._arm = setTimeout(function () { self.setState({ armed: null }); }, 4000);
        }
      };
    }
    var holdActive = mode.indexOf('HOLD') === 0, rtbActive = mode.indexOf('RTB') === 0;

    return {
      // pip
      pipPos: pos[corner] || pos.bl,
      sqTL: corner === 'tl' ? sqOn : sqOff, sqTR: corner === 'tr' ? sqOn : sqOff,
      sqBL: corner === 'bl' ? sqOn : sqOff, sqBR: corner === 'br' ? sqOn : sqOff,
      mapMain: !swapped, videoMain: swapped,
      pipLabel: swapped ? 'MAP · PX-07 · NAI-3' : 'IR · WHITE-HOT · HFOV 6.2°',
      cyclePip: function () { self.setState({ corner: nextC[corner] || 'tl' }); },
      swap: function () { self.setState({ swapped: !swapped }); },

      // top bar + telemetry
      mode: mode,
      apTxt: holdActive ? 'HOLD' : (rtbActive ? 'RTB · LZ-A' : 'AUTO · LOITER'),
      iasTxt: ias + ' m/s', altTxt: alt + ' m', aglTxt: (alt - 350) + ' m', gsTxt: (ias + 4) + ' m/s',
      hdgTxt: (hdg < 10 ? '00' : hdg < 100 ? '0' : '') + hdg + '°',
      flightTxt: (flightSec >= 36000 ? '' : '0') + hms(flightSec),
      bingoHM: hm(bingoSec), bingoHMS: hms(bingoSec),
      rpm: rpm.toLocaleString('en-US').replace(',', ''), rpmAng: (-120 + rpm / 7000 * 240).toFixed(1),
      cht1i: Math.round(cht1), cht2i: Math.round(cht2), egti: Math.round(egt),
      c1H: c1H.toFixed(1), c1Y: (132 - c1H).toFixed(1), c2H: c2H.toFixed(1), c2Y: (132 - c2H).toFixed(1),
      egH: egH.toFixed(1), egY: (132 - egH).toFixed(1),
      fuelTxt: fuel.toFixed(1) + ' L', fuelPct: Math.round(fuel / 42 * 100) + '%',
      tankH: tankH.toFixed(1), tankY: (188 - tankH).toFixed(1), tankLblY: Math.max(28, 188 - tankH + 4).toFixed(1),

      // caution / master caution
      acked: acked, notAcked: !acked,
      ack: function () { self.setState({ acked: true }); },
      mcStyle: acked ? 'border: 1px solid #3A3220; background: #15120C; color: #7A6643;' : 'border: 1px solid #FFB547; background: #FFB547; color: #1A1204;',
      mcLabel: acked ? 'Master caution, acknowledged' : 'Master caution, active, press to acknowledge',

      // health-strip windows
      engOpen: panel === 'eng', fuelOpen: panel === 'fuel',
      openEng: function () { self.setState({ panel: (self.state || {}).panel === 'eng' ? null : 'eng' }); },
      openFuel: function () { self.setState({ panel: (self.state || {}).panel === 'fuel' ? null : 'fuel' }); },
      closePanel: function () { self.setState({ panel: null }); },
      engSeg: panel === 'eng' ? 'border: 2px solid #FFD08A;' : 'border: 1.5px solid #FFB547;',
      fuelSeg: panel === 'fuel' ? 'background: #1A2129; border: 1.5px solid #A9B2BB;' : 'background: #12171C; border: 1px solid #232B33;',
      engChev: panel === 'eng' ? 'M1 1 L5 5 L9 1' : 'M1 5 L5 1 L9 5',
      fuelChev: panel === 'fuel' ? 'M1 1 L5 5 L9 1' : 'M1 5 L5 1 L9 5',

      // command window
      spdT: spdT, altT: altT,
      spdUp: function () { self.setState({ spdT: Math.min(34, spdT + 1) }); },
      spdDn: function () { self.setState({ spdT: Math.max(22, spdT - 1) }); },
      altUp: function () { self.setState({ altT: Math.min(3000, altT + 50) }); },
      altDn: function () { self.setState({ altT: Math.max(600, altT - 50) }); },
      spdValStyle: spdT !== ias ? 'color: #FFFFFF; background: #2A333C; border-radius: 6px;' : 'color: #C9D1D9;',
      altValStyle: altT !== alt ? 'color: #FFFFFF; background: #2A333C; border-radius: 6px;' : 'color: #C9D1D9;',
      noPending: !pending,
      sendStyle: pending ? 'border: 1px solid #E4E8EC; background: #E4E8EC; color: #0B0E11;' : 'border: 1px solid #2A333C; background: transparent; color: #4A5560; cursor: default;',
      cancelStyle: pending ? '' : 'color: #4A5560; border-color: #2A333C; cursor: default;',
      send: function () {
        if (!pending) { return; }
        var parts = [];
        if (spdT !== ias) { parts.push('SPD ' + spdT); }
        if (altT !== alt) { parts.push('ALT ' + altT); }
        self.runCmd(parts.join(' · '), function () { return { ias: spdT, alt: altT }; });
      },
      cancel: function () { self.setState({ spdT: ias, altT: alt }); },
      doHold: twoStep('hold', 'HOLD · LOITER HERE', 'HOLD'),
      doRtb: twoStep('rtb', 'RTB · LZ-A', 'RTB LZ-A'),
      holdStyle: armed === 'hold' ? bigArmed : (holdActive ? bigActive : bigBase),
      rtbStyle: armed === 'rtb' ? bigArmed : (rtbActive ? bigActive : bigBase),
      holdSub: armed === 'hold' ? 'Tap again to confirm' : (holdActive ? 'Holding at present position' : 'Loiter at present position'),
      rtbSub: armed === 'rtb' ? 'Tap again to confirm' : (rtbActive ? 'Returning · LZ-A 46 km' : 'LZ-A · 46 km · 0:31'),
      offMission: holdActive || rtbActive,
      resume: function () { self.runCmd('RESUME WP 14', function () { return { mode: 'AUTO · LOITER' }; }); },
      cmdLabel: cmd.label,
      st1: cmd.step >= 1 ? stepOn : stepOff, st2: cmd.step >= 2 ? stepOn : stepOff, st3: cmd.step >= 3 ? stepOn : stepOff,

      // left menu
      drawerOpen: menu !== 'fly', isCheck: menu === 'check', isOther: menu !== 'fly' && menu !== 'check',
      menuTitle: titles[menu] || '',
      mFly: go('fly'), mPlan: go('plan'), mPayload: go('payload'), mCheck: go('check'), mSys: go('sys'), mLog: go('log'), mHand: go('hand'),
      nFly: menu === 'fly' ? navOn : navOff, nPlan: menu === 'plan' ? navOn : navOff, nPayload: menu === 'payload' ? navOn : navOff,
      nCheck: menu === 'check' ? navOn : navOff, nSys: menu === 'sys' ? navOn : navOff, nLog: menu === 'log' ? navOn : navOff, nHand: menu === 'hand' ? navOn : navOff,

      // checklist
      tabIsLand: ckTab === 'land', tabNotLand: ckTab !== 'land', tabName: tabNames[ckTab],
      tPre: tab('pre'), tCru: tab('cru'), tLand: tab('land'), tEmg: tab('emg'),
      tabPre: ckTab === 'pre' ? tabOn : tabOff, tabCru: ckTab === 'cru' ? tabOn : tabOff,
      tabLand: ckTab === 'land' ? tabOn : tabOff, tabEmg: ckTab === 'emg' ? tabOn : tabOff,
      m1: !!ck.m1, m2: !!ck.m2, m3: !!ck.m3, m4: !!ck.m4,
      k1: tick('m1'), k2: tick('m2'), k3: tick('m3'), k4: tick('m4'),
      b1: ck.m1 ? boxOn : boxOff, b2: ck.m2 ? boxOn : boxOff, b3: ck.m3 ? boxOn : boxOff, b4: ck.m4 ? boxOn : boxOff,
      ckDone: 5 + nMan, ckBar: 'width: ' + Math.round((5 + nMan) / 9 * 100) + '%;',
      notReady: !ready,
      armBt: function () { if (ready) { self.setState({ btArmed: !btArmed }); } },
      armStyle: !ready ? 'border: 1px solid #2A333C; background: #12171C; color: #6B7580; cursor: default;' : (btArmed ? 'border: 1px solid #E4E8EC; background: transparent; color: #E4E8EC;' : 'border: 1px solid #E4E8EC; background: #E4E8EC; color: #0B0E11;'),
      armLabel: btArmed ? 'Back-transition armed · WP 21' : 'Arm back-transition',
      armNote: !ready ? (4 - nMan) + ' operator item' + (4 - nMan === 1 ? '' : 's') + ' left' : (btArmed ? 'Armed. Tap again to disarm.' : 'Ready. The autopilot starts back-transition at WP 21.')
    };
  }
}
