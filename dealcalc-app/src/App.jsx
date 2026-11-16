import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { DEFAULT_STATE } from './defaultData';

const STORAGE_KEY = 'dealcalc_en_v1_state';

function parseNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function fmtMoney(n) {
  const val = Number(n) || 0;
  const sign = val < 0 ? '-' : '';
  return sign + '$' + Math.abs(val).toFixed(2);
}

function profitClass(n) {
  if (n > 0.004) return 'profit-pos';
  if (n < -0.004) return 'profit-neg';
  return 'profit-zero';
}

export default function App() {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  });

  const [syncStatus, setSyncStatus] = useState({
    type: supabase ? 'connected' : 'local',
    text: supabase ? 'Cloud Ready' : 'Missing .env'
  });

  const [revSearch, setRevSearch] = useState('');
  const [revStatusFilter, setRevStatusFilter] = useState('ALL');
  const syncTimers = useRef({});
  const stateRef = useRef(state);
  stateRef.current = state;

  // Save to localStorage whenever state updates
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error(e);
    }
  }, [state]);

  // Initial pull from Supabase on mount
  useEffect(() => {
    if (supabase) {
      syncFromCloud(false);
    }
  }, []);

  // ==================== CLOUD SYNC ENGINE ====================
  function scheduleSync(tableToSync) {
    if (!supabase || !tableToSync) return;
    clearTimeout(syncTimers.current[tableToSync]);
    setSyncStatus({ type: 'syncing', text: 'Saving...' });
    syncTimers.current[tableToSync] = setTimeout(() => {
      pushTableToCloud(tableToSync);
    }, 450);
  }

  async function pushTableToCloud(table) {
    if (!supabase) return;
    const current = stateRef.current;
    try {
      if (table === 'walgreens') {
        const payload = current.wgScenarios.map((s) => ({
          id: s.id,
          name: s.name,
          tax_rate: parseNum(s.taxRate),
          spend_req: parseNum(s.spendReq),
          booster_get: parseNum(s.boosterGet),
          rows: s.rows || []
        }));
        const { error } = await supabase.from('walgreens').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      } else if (table === 'cvs') {
        const payload = current.cvsScenarios.map((s) => ({
          id: s.id,
          name: s.name,
          tax_rate: parseNum(s.taxRate),
          rows: s.rows || []
        }));
        const { error } = await supabase.from('cvs').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      } else if (table === 'frys') {
        const { error } = await supabase.from('frys').upsert(
          {
            id: 'default',
            accounts: current.frys.accounts || [],
            deals: current.frys.deals || []
          },
          { onConflict: 'id' }
        );
        if (error) throw error;
      } else if (table === 'reviews') {
        const payload = current.reviews.map((r) => ({
          id: r.id,
          account: r.account || 'Bo',
          product: r.product || '',
          cost: parseNum(r.cost),
          submit_date: r.submitDate || '',
          received: parseNum(r.received)
        }));
        const { error } = await supabase.from('reviews').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      }
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSyncStatus({ type: 'synced', text: `Synced ${timeStr}` });
    } catch (err) {
      console.error(`Sync error (${table}):`, err);
      setSyncStatus({ type: 'error', text: 'Sync Failed' });
    }
  }

  async function deleteCloudRow(table, id) {
    if (!supabase) return;
    try {
      setSyncStatus({ type: 'syncing', text: 'Deleting...' });
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSyncStatus({ type: 'synced', text: `Synced ${timeStr}` });
    } catch (err) {
      console.error(`Delete error (${table}):`, err);
      setSyncStatus({ type: 'error', text: 'Delete Failed' });
    }
  }

  async function pushLocalToCloud() {
    if (!supabase) return alert('Supabase environment variables missing in .env.local');
    if (!window.confirm('Overwrite cloud database with your current local data?')) return;
    setSyncStatus({ type: 'syncing', text: 'Uploading all...' });
    try {
      await supabase.from('walgreens').delete().neq('id', '__none__');
      await supabase.from('cvs').delete().neq('id', '__none__');
      await supabase.from('frys').delete().neq('id', '__none__');
      await supabase.from('reviews').delete().neq('id', '__none__');

      await pushTableToCloud('walgreens');
      await pushTableToCloud('cvs');
      await pushTableToCloud('frys');
      await pushTableToCloud('reviews');

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSyncStatus({ type: 'synced', text: `Uploaded ${timeStr}` });
      alert('All local data pushed to Supabase!');
    } catch (err) {
      console.error(err);
      setSyncStatus({ type: 'error', text: 'Upload Failed' });
      alert('Upload failed: ' + err.message);
    }
  }

  async function syncFromCloud(promptIfEmpty = false) {
    if (!supabase) return;
    setSyncStatus({ type: 'syncing', text: 'Pulling...' });
    try {
      const [wgRes, cvsRes, frysRes, revRes] = await Promise.all([
        supabase.from('walgreens').select('*'),
        supabase.from('cvs').select('*'),
        supabase.from('frys').select('*').eq('id', 'default').maybeSingle(),
        supabase.from('reviews').select('*')
      ]);

      if (wgRes.error) throw wgRes.error;
      if (cvsRes.error) throw cvsRes.error;
      if (frysRes.error) throw frysRes.error;
      if (revRes.error) throw revRes.error;

      const isCloudEmpty =
        (!wgRes.data || wgRes.data.length === 0) &&
        (!cvsRes.data || cvsRes.data.length === 0) &&
        !frysRes.data &&
        (!revRes.data || revRes.data.length === 0);

      if (isCloudEmpty) {
        setSyncStatus({ type: 'connected', text: 'Cloud Empty' });
        if (promptIfEmpty && window.confirm('Supabase tables are empty. Upload current local data to initialize cloud?')) {
          await pushLocalToCloud();
        }
        return;
      }

      setState((prev) => {
        const next = { ...prev };
        if (wgRes.data?.length > 0) {
          next.wgScenarios = wgRes.data.map((row) => ({
            id: row.id,
            name: row.name,
            taxRate: Number(row.tax_rate) || 0.086,
            spendReq: Number(row.spend_req) || 0,
            boosterGet: Number(row.booster_get) || 0,
            rows: Array.isArray(row.rows) ? row.rows : []
          }));
          if (!next.wgScenarios.find((s) => s.id === next.wgActiveId)) {
            next.wgActiveId = next.wgScenarios[0].id;
          }
        }
        if (cvsRes.data?.length > 0) {
          next.cvsScenarios = cvsRes.data.map((row) => ({
            id: row.id,
            name: row.name,
            taxRate: Number(row.tax_rate) || 0.086,
            rows: Array.isArray(row.rows) ? row.rows : []
          }));
          if (!next.cvsScenarios.find((s) => s.id === next.cvsActiveId)) {
            next.cvsActiveId = next.cvsScenarios[0].id;
          }
        }
        if (frysRes.data) {
          next.frys = {
            accounts: Array.isArray(frysRes.data.accounts) ? frysRes.data.accounts : [],
            deals: Array.isArray(frysRes.data.deals) ? frysRes.data.deals : []
          };
        }
        if (revRes.data?.length > 0) {
          next.reviews = revRes.data.map((row) => ({
            id: row.id,
            account: row.account || 'Bo',
            product: row.product || '',
            cost: Number(row.cost) || 0,
            submitDate: row.submit_date || '',
            received: Number(row.received) || 0
          }));
        }
        return next;
      });

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSyncStatus({ type: 'synced', text: `Synced ${timeStr}` });
    } catch (err) {
      console.error('Pull failed:', err);
      setSyncStatus({ type: 'error', text: 'Sync Error' });
    }
  }

  // ==================== BACKUP / EXPORT / IMPORT ====================
  function exportAllJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dealcalc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importAllJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed && parsed.wgScenarios && parsed.cvsScenarios) {
          setState(parsed);
          if (supabase) {
            setTimeout(async () => {
              await pushTableToCloud('walgreens');
              await pushTableToCloud('cvs');
              await pushTableToCloud('frys');
              await pushTableToCloud('reviews');
            }, 100);
          }
          alert('Backup imported & synced successfully.');
        } else {
          alert('Invalid JSON format.');
        }
      } catch (err) {
        alert('Failed to parse JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function resetToDefault() {
    if (!window.confirm('Reset all local changes back to default data?')) return;
    setState(JSON.parse(JSON.stringify(DEFAULT_STATE)));
  }

  // ==================== WALGREENS DATA & HANDLERS ====================
  const activeWg = state.wgScenarios.find((s) => s.id === state.wgActiveId) || state.wgScenarios[0];

  function updateWgMeta(field, value) {
    setState((prev) => ({
      ...prev,
      wgScenarios: prev.wgScenarios.map((s) =>
        s.id === activeWg.id ? { ...s, [field]: value } : s
      )
    }));
    scheduleSync('walgreens');
  }

  function updateWgRow(idx, field, value) {
    setState((prev) => ({
      ...prev,
      wgScenarios: prev.wgScenarios.map((s) => {
        if (s.id !== activeWg.id) return s;
        const rows = [...s.rows];
        rows[idx] = { ...rows[idx], [field]: value };
        return { ...s, rows };
      })
    }));
    scheduleSync('walgreens');
  }

  function addWgRow() {
    setState((prev) => ({
      ...prev,
      wgScenarios: prev.wgScenarios.map((s) =>
        s.id === activeWg.id
          ? {
              ...s,
              rows: [
                ...s.rows,
                { product: '', price: 0, count: 1, taxable: 1, percentage: 1, mfc: 0, ivc: 0, wc: 0, rr: 0, ibotta: 0, other: 0 }
              ]
            }
          : s
      )
    }));
    scheduleSync('walgreens');
  }

  function removeWgRow(idx) {
    setState((prev) => ({
      ...prev,
      wgScenarios: prev.wgScenarios.map((s) =>
        s.id === activeWg.id ? { ...s, rows: s.rows.filter((_, i) => i !== idx) } : s
      )
    }));
    scheduleSync('walgreens');
  }

  function addWgScenario() {
    const name = window.prompt('New Walgreens scenario name:');
    if (!name) return;
    const id = 'wg-' + Date.now();
    setState((prev) => ({
      ...prev,
      wgActiveId: id,
      wgScenarios: [
        ...prev.wgScenarios,
        {
          id,
          name,
          taxRate: 0.086,
          spendReq: 30,
          boosterGet: 7,
          rows: [{ product: '', price: 0, count: 1, taxable: 1, percentage: 1, mfc: 0, ivc: 0, wc: 0, rr: 0, ibotta: 0, other: 0 }]
        }
      ]
    }));
    scheduleSync('walgreens');
  }

  function duplicateWgScenario() {
    const name = window.prompt('Duplicate scenario name:', activeWg.name + ' (Copy)');
    if (!name) return;
    const copy = JSON.parse(JSON.stringify(activeWg));
    copy.id = 'wg-' + Date.now();
    copy.name = name;
    setState((prev) => ({
      ...prev,
      wgActiveId: copy.id,
      wgScenarios: [...prev.wgScenarios, copy]
    }));
    scheduleSync('walgreens');
  }

  function deleteWgScenario() {
    if (state.wgScenarios.length <= 1) return alert('At least one scenario is required.');
    if (!window.confirm('Delete current scenario?')) return;
    const delId = activeWg.id;
    const remaining = state.wgScenarios.filter((s) => s.id !== delId);
    setState((prev) => ({
      ...prev,
      wgActiveId: remaining[0].id,
      wgScenarios: remaining
    }));
    deleteCloudRow('walgreens', delId);
  }

  // Walgreens Calculations
  let wgSubtotal = 0, wgTotalTax = 0, wgTotalMfc = 0, wgTotalIvc = 0;
  let wgTotalWc = 0, wgTotalRr = 0, wgTotalIbotta = 0, wgTotalOther = 0;
  activeWg.rows.forEach((r) => {
    const rowTotal = parseNum(r.price) * parseNum(r.count) * parseNum(r.percentage);
    const rowTax = Number(r.taxable) ? rowTotal * parseNum(activeWg.taxRate) : 0;
    wgSubtotal += rowTotal;
    wgTotalTax += rowTax;
    wgTotalMfc += parseNum(r.mfc);
    wgTotalIvc += parseNum(r.ivc);
    wgTotalWc += parseNum(r.wc);
    wgTotalRr += parseNum(r.rr);
    wgTotalIbotta += parseNum(r.ibotta);
    wgTotalOther += parseNum(r.other);
  });
  const wgTotalSpend = wgSubtotal - wgTotalIvc;
  const wgSpendReq = parseNum(activeWg.spendReq);
  const wgBoosterGet = parseNum(activeWg.boosterGet);
  const wgBoosterEarned = wgSpendReq > 0 && wgTotalSpend >= wgSpendReq ? wgBoosterGet : wgSpendReq === 0 ? wgBoosterGet : 0;
  const wgCanUseWc = wgSpendReq > 0 ? Math.max(0, Math.floor(wgTotalSpend - wgSpendReq)) : Math.max(0, Math.floor(wgSubtotal - wgTotalMfc - wgTotalIvc));
  const wgTotalAfterTax = wgSubtotal - wgTotalMfc - wgTotalIvc + wgTotalTax;
  const wgTotalEarned = wgTotalWc + wgTotalRr + wgTotalIbotta + wgTotalOther + wgBoosterEarned;
  const wgNetProfit = wgTotalEarned - wgTotalAfterTax;

  // ==================== CVS DATA & HANDLERS ====================
  const activeCvs = state.cvsScenarios.find((s) => s.id === state.cvsActiveId) || state.cvsScenarios[0];

  function updateCvsMeta(val) {
    setState((prev) => ({
      ...prev,
      cvsScenarios: prev.cvsScenarios.map((s) => (s.id === activeCvs.id ? { ...s, taxRate: val } : s))
    }));
    scheduleSync('cvs');
  }

  function updateCvsRow(idx, field, val) {
    setState((prev) => ({
      ...prev,
      cvsScenarios: prev.cvsScenarios.map((s) => {
        if (s.id !== activeCvs.id) return s;
        const rows = [...s.rows];
        rows[idx] = { ...rows[idx], [field]: val };
        return { ...s, rows };
      })
    }));
    scheduleSync('cvs');
  }

  function addCvsRow() {
    setState((prev) => ({
      ...prev,
      cvsScenarios: prev.cvsScenarios.map((s) =>
        s.id === activeCvs.id
          ? { ...s, rows: [...s.rows, { product: '', price: 0, count: 1, percentage: 1, mfr: 0, crt: 0, eb: 0, ibotta: 0, other: 0 }] }
          : s
      )
    }));
    scheduleSync('cvs');
  }

  function removeCvsRow(idx) {
    setState((prev) => ({
      ...prev,
      cvsScenarios: prev.cvsScenarios.map((s) =>
        s.id === activeCvs.id ? { ...s, rows: s.rows.filter((_, i) => i !== idx) } : s
      )
    }));
    scheduleSync('cvs');
  }

  function addCvsScenario() {
    const name = window.prompt('New CVS scenario name:');
    if (!name) return;
    const id = 'cvs-' + Date.now();
    setState((prev) => ({
      ...prev,
      cvsActiveId: id,
      cvsScenarios: [
        ...prev.cvsScenarios,
        { id, name, taxRate: 0.086, rows: [{ product: '', price: 0, count: 1, percentage: 1, mfr: 0, crt: 0, eb: 0, ibotta: 0, other: 0 }] }
      ]
    }));
    scheduleSync('cvs');
  }

  function duplicateCvsScenario() {
    const name = window.prompt('Duplicate scenario name:', activeCvs.name + ' (Copy)');
    if (!name) return;
    const copy = JSON.parse(JSON.stringify(activeCvs));
    copy.id = 'cvs-' + Date.now();
    copy.name = name;
    setState((prev) => ({
      ...prev,
      cvsActiveId: copy.id,
      cvsScenarios: [...prev.cvsScenarios, copy]
    }));
    scheduleSync('cvs');
  }

  function deleteCvsScenario() {
    if (state.cvsScenarios.length <= 1) return alert('At least one scenario is required.');
    if (!window.confirm('Delete current scenario?')) return;
    const delId = activeCvs.id;
    const remaining = state.cvsScenarios.filter((s) => s.id !== delId);
    setState((prev) => ({
      ...prev,
      cvsActiveId: remaining[0].id,
      cvsScenarios: remaining
    }));
    deleteCloudRow('cvs', delId);
  }

  // CVS Calculations
  let cvsSubtotal = 0, cvsTotalMfr = 0, cvsTotalCrt = 0, cvsTotalBeforeTax = 0;
  let cvsTotalEb = 0, cvsTotalIbotta = 0, cvsTotalOther = 0, cvsTotalProfit = 0, cvsTotalAfterTax = 0;
  activeCvs.rows.forEach((r) => {
    const sub = parseNum(r.price) * parseNum(r.count) * parseNum(r.percentage);
    const mfr = parseNum(r.mfr);
    const crt = parseNum(r.crt);
    const beforeTax = sub - mfr - crt;
    const rowTax = Math.max(0, sub - crt) * parseNum(activeCvs.taxRate);
    const afterTax = beforeTax + rowTax;
    const eb = parseNum(r.eb);
    const ibotta = parseNum(r.ibotta);
    const other = parseNum(r.other);
    cvsSubtotal += sub;
    cvsTotalMfr += mfr;
    cvsTotalCrt += crt;
    cvsTotalBeforeTax += beforeTax;
    cvsTotalAfterTax += afterTax;
    cvsTotalEb += eb;
    cvsTotalIbotta += ibotta;
    cvsTotalOther += other;
    cvsTotalProfit += eb + ibotta + other - afterTax;
  });
  const cvsCanUseEb = Math.max(0, cvsTotalBeforeTax);
  const cvsTotalEarned = cvsTotalEb + cvsTotalIbotta + cvsTotalOther;

  // ==================== FRY'S HANDLERS ====================
  function toggleFrysStatus(dIdx, accId, key, checked) {
    setState((prev) => {
      const deals = [...prev.frys.deals];
      const deal = { ...deals[dIdx], status: { ...deals[dIdx].status } };
      deal.status[accId] = { ...(deal.status[accId] || { buy: false, receive: false }), [key]: checked };
      deals[dIdx] = deal;
      return { ...prev, frys: { ...prev.frys, deals } };
    });
    scheduleSync('frys');
  }

  function updateFrysDealName(dIdx, val) {
    setState((prev) => {
      const deals = [...prev.frys.deals];
      deals[dIdx] = { ...deals[dIdx], name: val };
      return { ...prev, frys: { ...prev.frys, deals } };
    });
    scheduleSync('frys');
  }

  function addFrysDeal() {
    const name = window.prompt("New Fry's Deal name:");
    if (!name) return;
    const status = {};
    state.frys.accounts.forEach((a) => (status[a.id] = { buy: false, receive: false }));
    setState((prev) => ({
      ...prev,
      frys: { ...prev.frys, deals: [...prev.frys.deals, { id: 'd-' + Date.now(), name, status }] }
    }));
    scheduleSync('frys');
  }

  function removeFrysDeal(dIdx) {
    if (!window.confirm('Delete this deal?')) return;
    setState((prev) => ({
      ...prev,
      frys: { ...prev.frys, deals: prev.frys.deals.filter((_, i) => i !== dIdx) }
    }));
    scheduleSync('frys');
  }

  function updateFrysAccount(aIdx, field, val) {
    setState((prev) => {
      const accounts = [...prev.frys.accounts];
      accounts[aIdx] = { ...accounts[aIdx], [field]: val };
      return { ...prev, frys: { ...prev.frys, accounts } };
    });
    scheduleSync('frys');
  }

  function addFrysAccount() {
    const phone = window.prompt('Account phone number:');
    if (!phone) return;
    const email = window.prompt('Account email / label (optional):') || '';
    const id = 'acc-' + Date.now();
    setState((prev) => ({
      ...prev,
      frys: {
        accounts: [...prev.frys.accounts, { id, email, phone }],
        deals: prev.frys.deals.map((d) => ({ ...d, status: { ...d.status, [id]: { buy: false, receive: false } } }))
      }
    }));
    scheduleSync('frys');
  }

  function removeFrysAccount(aIdx) {
    if (!window.confirm('Remove this account column?')) return;
    const accId = state.frys.accounts[aIdx].id;
    setState((prev) => ({
      ...prev,
      frys: {
        accounts: prev.frys.accounts.filter((_, i) => i !== aIdx),
        deals: prev.frys.deals.map((d) => {
          const st = { ...d.status };
          delete st[accId];
          return { ...d, status: st };
        })
      }
    }));
    scheduleSync('frys');
  }

  // ==================== REVIEWS HANDLERS & METRICS ====================
  function updateReviewRow(id, field, val) {
    setState((prev) => ({
      ...prev,
      reviews: prev.reviews.map((r) =>
        r.id === id ? { ...r, [field]: field === 'cost' || field === 'received' ? parseNum(val) : val } : r
      )
    }));
    scheduleSync('reviews');
  }

  function addReviewRow() {
    const acc = state.reviewAccountFilter === 'Star' ? 'Star' : 'Bo';
    setState((prev) => ({
      ...prev,
      reviews: [{ id: 'r-' + Date.now(), account: acc, product: '', cost: 0, submitDate: '', received: 0 }, ...prev.reviews]
    }));
    scheduleSync('reviews');
  }

  function removeReviewRow(id) {
    if (!window.confirm('Delete this entry?')) return;
    setState((prev) => ({
      ...prev,
      reviews: prev.reviews.filter((r) => r.id !== id)
    }));
    deleteCloudRow('reviews', id);
  }

  let boCost = 0, boRec = 0, boCnt = 0;
  let starCost = 0, starRec = 0, starCnt = 0;
  let pendingCnt = 0, pendingAmt = 0;
  state.reviews.forEach((r) => {
    const c = parseNum(r.cost);
    const rec = parseNum(r.received);
    if (r.account === 'Bo') { boCost += c; boRec += rec; boCnt++; }
    if (r.account === 'Star') { starCost += c; starRec += rec; starCnt++; }
    if (rec === 0 && c > 0) { pendingCnt++; pendingAmt += c; }
  });
  const boDiff = boRec - boCost;
  const starDiff = starRec - starCost;
  const allDiff = boDiff + starDiff;

  const filteredReviews = state.reviews.filter((r) => {
    if (state.reviewAccountFilter !== 'ALL' && r.account !== state.reviewAccountFilter) return false;
    if (revSearch && !(r.product || '').toLowerCase().includes(revSearch.toLowerCase().trim())) return false;
    const cost = parseNum(r.cost);
    const rec = parseNum(r.received);
    const diff = rec - cost;
    if (revStatusFilter === 'UNPAID' && rec > 0) return false;
    if (revStatusFilter === 'UNSUBMITTED' && (r.submitDate || '').trim() !== '') return false;
    if (revStatusFilter === 'PROFIT' && diff <= 0.004) return false;
    if (revStatusFilter === 'LOSS' && diff >= -0.004) return false;
    return true;
  });

  const filteredRevCost = filteredReviews.reduce((acc, r) => acc + parseNum(r.cost), 0);
  const filteredRevRec = filteredReviews.reduce((acc, r) => acc + parseNum(r.received), 0);
  const filteredRevDiff = filteredRevRec - filteredRevCost;

  // ==================== RENDER ====================
  const syncDotColor =
    syncStatus.type === 'connected' || syncStatus.type === 'synced'
      ? 'bg-emerald-500'
      : syncStatus.type === 'syncing'
      ? 'bg-blue-500 animate-pulse'
      : syncStatus.type === 'error'
      ? 'bg-rose-500'
      : 'bg-amber-400';

  return (
    <div className="min-h-screen flex flex-col pb-10">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-2.5 sm:py-3 gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                $
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">DealCalc</h1>
            </div>

            {/* Global Actions */}
            <div className="flex items-center gap-1.5 text-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-medium">
                <span className={`w-2 h-2 rounded-full ${syncDotColor}`}></span>
                <span>{syncStatus.text}</span>
              </div>
              {supabase && (
                <>
                  <button
                    onClick={() => syncFromCloud(true)}
                    className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition"
                    title="Pull latest from cloud"
                  >
                    ↻ Sync
                  </button>
                  <button
                    onClick={pushLocalToCloud}
                    className="hidden sm:inline-block px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium transition"
                    title="Overwrite cloud with local data"
                  >
                    ↑ Push
                  </button>
                </>
              )}
              <button
                onClick={exportAllJSON}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium transition"
              >
                Export
              </button>
              <label className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer transition">
                Import
                <input type="file" accept=".json" className="hidden" onChange={importAllJSON} />
              </label>
              <button
                onClick={resetToDefault}
                className="hidden sm:inline-block px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium transition"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-5 sm:space-x-7 overflow-x-auto no-scrollbar -mb-px text-xs sm:text-sm">
            {[
              { id: 'walgreens', label: 'Walgreens', dot: 'bg-red-500' },
              { id: 'cvs', label: 'CVS', dot: 'bg-rose-600' },
              { id: 'frys', label: "Fry's Deals", dot: 'bg-blue-600' },
              { id: 'review', label: 'Reviews', dot: 'bg-amber-500' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setState((prev) => ({ ...prev, activeTab: t.id }))}
                className={`py-2.5 px-1 whitespace-nowrap flex items-center gap-1.5 transition shrink-0 ${
                  state.activeTab === t.id ? 'tab-active' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${t.dot}`}></span> {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* ==================== TAB 1: WALGREENS ==================== */}
        {state.activeTab === 'walgreens' && (
          <section className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={activeWg.id}
                    onChange={(e) => setState((prev) => ({ ...prev, wgActiveId: e.target.value }))}
                    className="flex-1 sm:flex-none min-w-[160px] rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800"
                  >
                    {state.wgScenarios.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <button onClick={addWgScenario} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">+ New</button>
                    <button onClick={duplicateWgScenario} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">Duplicate</button>
                    <button onClick={deleteWgScenario} className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50">Delete</button>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 sm:gap-4 text-xs">
                  <label className="flex flex-col sm:flex-row sm:items-center gap-1 text-slate-600">
                    <span className="text-[11px] text-slate-500 font-medium">Tax Rate</span>
                    <input type="text" inputMode="decimal" value={activeWg.taxRate} onChange={(e) => updateWgMeta('taxRate', e.target.value)} className="w-full sm:w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm" />
                  </label>
                  <label className="flex flex-col sm:flex-row sm:items-center gap-1 text-slate-600">
                    <span className="text-[11px] text-slate-500 font-medium">Spend Req</span>
                    <input type="text" inputmode="decimal" value={activeWg.spendReq} onChange={(e) => updateWgMeta('spendReq', e.target.value)} className="w-full sm:w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm" />
                  </label>
                  <label className="flex flex-col sm:flex-row sm:items-center gap-1 text-slate-600">
                    <span className="text-[11px] text-slate-500 font-medium">Booster Get</span>
                    <input type="text" inputMode="decimal" value={activeWg.boosterGet} onChange={(e) => updateWgMeta('boosterGet', e.target.value)} className="w-full sm:w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm" />
                  </label>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-3.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="text-[11px] text-slate-500 font-medium">SUBTOTAL</div>
                  <div className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 font-mono">{fmtMoney(wgSubtotal)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">Tax: {fmtMoney(wgTotalTax)}</div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/70">
                  <div className="text-[11px] text-blue-700 font-medium">QUALIFYING SPEND</div>
                  <div className="text-lg sm:text-xl font-bold text-blue-900 mt-0.5 font-mono">{fmtMoney(wgTotalSpend)}</div>
                  <div className={`text-[11px] mt-0.5 font-semibold leading-tight ${wgSpendReq > 0 ? (wgTotalSpend >= wgSpendReq ? 'text-emerald-700' : 'text-rose-600') : 'text-slate-500'}`}>
                    {wgSpendReq > 0 ? (wgTotalSpend >= wgSpendReq ? `Met $${wgSpendReq} (+$${(wgTotalSpend - wgSpendReq).toFixed(2)})` : `Need $${(wgSpendReq - wgTotalSpend).toFixed(2)} more`) : 'No spend req'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70">
                  <div className="text-[11px] text-amber-800 font-medium">MAX WC TO USE</div>
                  <div className="text-lg sm:text-xl font-bold text-amber-900 mt-0.5 font-mono">{fmtMoney(wgCanUseWc)}</div>
                  <div className="text-[10px] text-amber-700/80 mt-0.5">Safe WC limit</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="text-[11px] text-slate-500 font-medium">OOP (AFTER TAX)</div>
                  <div className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 font-mono">{fmtMoney(wgTotalAfterTax)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">MFC: ${wgTotalMfc.toFixed(2)} | IVC: ${wgTotalIvc.toFixed(2)}</div>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/70">
                  <div className="text-[11px] text-purple-700 font-medium">TOTAL EARNED</div>
                  <div className="text-lg sm:text-xl font-bold text-purple-900 mt-0.5 font-mono">{fmtMoney(wgTotalEarned)}</div>
                  <div className="text-[10px] text-purple-700/80 mt-0.5 font-mono truncate">WC ${wgTotalWc} + RR ${wgTotalRr} + Ib ${wgTotalIbotta} + Bst ${wgBoosterEarned}</div>
                </div>
                <div className={`p-3 rounded-xl border ${wgNetProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">NET PROFIT</div>
                  <div className={`text-xl sm:text-2xl font-bold mt-0.5 font-mono ${wgNetProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(wgNetProfit)}</div>
                  <div className={`text-[11px] font-semibold mt-0.5 ${wgNetProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {wgNetProfit >= 0 ? (wgNetProfit > 0 ? 'Moneymaker!' : 'Freebie') : `Net Cost: ${fmtMoney(Math.abs(wgNetProfit))}`}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-800 text-sm mr-2">Items</span>
                Tax: 1=Yes, 0=No · Pct: 0.75 for BOGO 50%
              </div>
              <button onClick={addWgRow} className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm">+ Add Item</button>
            </div>

            {/* Desktop Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 min-w-[130px]">Product</th>
                    <th className="py-2.5 px-2 w-20 text-right">Price</th>
                    <th className="py-2.5 px-2 w-16 text-right">Qty</th>
                    <th className="py-2.5 px-2 w-16 text-center">Tax</th>
                    <th className="py-2.5 px-2 w-20 text-right">Pct</th>
                    <th className="py-2.5 px-2 w-20 text-right bg-slate-100/70">Total</th>
                    <th className="py-2.5 px-2 w-16 text-right bg-slate-100/70">Tax $</th>
                    <th className="py-2.5 px-2 w-20 text-right text-blue-700">MFC</th>
                    <th className="py-2.5 px-2 w-20 text-right text-blue-700">IVC/SC</th>
                    <th className="py-2.5 px-2 w-20 text-right text-purple-700">WC</th>
                    <th className="py-2.5 px-2 w-20 text-right text-purple-700">RR</th>
                    <th className="py-2.5 px-2 w-20 text-right text-purple-700">Ibotta</th>
                    <th className="py-2.5 px-2 w-20 text-right text-purple-700">Other</th>
                    <th className="py-2.5 px-3 w-24 text-right bg-slate-100/70">Profit</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeWg.rows.map((r, idx) => {
                    const rowTotal = parseNum(r.price) * parseNum(r.count) * parseNum(r.percentage);
                    const rowTax = Number(r.taxable) ? rowTotal * parseNum(activeWg.taxRate) : 0;
                    const rowEarned = parseNum(r.wc) + parseNum(r.rr) + parseNum(r.ibotta) + parseNum(r.other);
                    const rowOut = rowTotal - parseNum(r.mfc) - parseNum(r.ivc) + rowTax;
                    const rowProfit = rowEarned - rowOut;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-1.5 px-3"><input type="text" value={r.product || ''} onChange={(e) => updateWgRow(idx, 'product', e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 font-medium" placeholder="Item" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.price} onChange={(e) => updateWgRow(idx, 'price', e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.count} onChange={(e) => updateWgRow(idx, 'count', e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2 text-center">
                          <select value={r.taxable} onChange={(e) => updateWgRow(idx, 'taxable', e.target.value)} className="rounded border border-slate-200 px-1 py-1 font-mono bg-white">
                            <option value={1}>1</option>
                            <option value={0}>0</option>
                          </select>
                        </td>
                        <td className="p-1.5 px-2"><input type="text" value={r.percentage} onChange={(e) => updateWgRow(idx, 'percentage', e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2 text-right font-mono bg-slate-50/70">{rowTotal.toFixed(2)}</td>
                        <td className="p-1.5 px-2 text-right font-mono bg-slate-50/70 text-slate-500">{rowTax.toFixed(2)}</td>
                        <td className="p-1.5 px-2"><input type="text" value={r.mfc} onChange={(e) => updateWgRow(idx, 'mfc', e.target.value)} className="w-full rounded border border-blue-200 bg-blue-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.ivc} onChange={(e) => updateWgRow(idx, 'ivc', e.target.value)} className="w-full rounded border border-blue-200 bg-blue-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.wc} onChange={(e) => updateWgRow(idx, 'wc', e.target.value)} className="w-full rounded border border-purple-200 bg-purple-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.rr} onChange={(e) => updateWgRow(idx, 'rr', e.target.value)} className="w-full rounded border border-purple-200 bg-purple-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.ibotta} onChange={(e) => updateWgRow(idx, 'ibotta', e.target.value)} className="w-full rounded border border-purple-200 bg-purple-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.other} onChange={(e) => updateWgRow(idx, 'other', e.target.value)} className="w-full rounded border border-purple-200 bg-purple-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className={`p-1.5 px-3 text-right font-mono bg-slate-50/70 ${profitClass(rowProfit)}`}>{fmtMoney(rowProfit)}</td>
                        <td className="p-1.5 px-2 text-center"><button onClick={() => removeWgRow(idx)} className="text-slate-400 hover:text-rose-600 font-bold text-base">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ==================== TAB 2: CVS ==================== */}
        {state.activeTab === 'cvs' && (
          <section className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={activeCvs.id}
                    onChange={(e) => setState((prev) => ({ ...prev, cvsActiveId: e.target.value }))}
                    className="flex-1 sm:flex-none min-w-[160px] rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800"
                  >
                    {state.cvsScenarios.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <button onClick={addCvsScenario} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100">+ New</button>
                    <button onClick={duplicateCvsScenario} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">Duplicate</button>
                    <button onClick={deleteCvsScenario} className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50">Delete</button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Tax Rate:</span>
                  <input type="text" value={activeCvs.taxRate} onChange={(e) => updateCvsMeta(e.target.value)} className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-3.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="text-[11px] text-slate-500 font-medium">SUBTOTAL</div>
                  <div className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 font-mono">{fmtMoney(cvsSubtotal)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">MFR: ${cvsTotalMfr.toFixed(2)} | CRT: ${cvsTotalCrt.toFixed(2)}</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70">
                  <div className="text-[11px] text-amber-800 font-medium">MAX EB TO USE</div>
                  <div className="text-lg sm:text-xl font-bold text-amber-900 mt-0.5 font-mono">{fmtMoney(cvsCanUseEb)}</div>
                  <div className="text-[10px] text-amber-700/80 mt-0.5">SubTotal - MFR - CRT</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="text-[11px] text-slate-500 font-medium">OOP (AFTER TAX)</div>
                  <div className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 font-mono">{fmtMoney(cvsTotalAfterTax)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">Pre-Tax: {fmtMoney(cvsTotalBeforeTax)}</div>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/70">
                  <div className="text-[11px] text-purple-700 font-medium">TOTAL EARNED</div>
                  <div className="text-lg sm:text-xl font-bold text-purple-900 mt-0.5 font-mono">{fmtMoney(cvsTotalEarned)}</div>
                  <div className="text-[10px] text-purple-700/80 mt-0.5 font-mono truncate">EB ${cvsTotalEb} + Ibotta ${cvsTotalIbotta} + Other ${cvsTotalOther}</div>
                </div>
                <div className={`col-span-2 sm:col-span-1 p-3 rounded-xl border ${cvsTotalProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">NET PROFIT</div>
                  <div className={`text-xl sm:text-2xl font-bold mt-0.5 font-mono ${cvsTotalProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(cvsTotalProfit)}</div>
                  <div className={`text-[11px] font-semibold mt-0.5 ${cvsTotalProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {cvsTotalProfit >= 0 ? (cvsTotalProfit > 0 ? 'Moneymaker!' : 'Freebie') : `Net Cost: ${fmtMoney(Math.abs(cvsTotalProfit))}`}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-800 text-sm mr-2">Items</span>
                Taxable base = SubTotal - CRT
              </div>
              <button onClick={addCvsRow} className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm">+ Add Item</button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 min-w-[140px]">Product</th>
                    <th className="py-2.5 px-2 w-20 text-right">Price</th>
                    <th className="py-2.5 px-2 w-16 text-right">Qty</th>
                    <th className="py-2.5 px-2 w-20 text-right">Pct</th>
                    <th className="py-2.5 px-2 w-22 text-right bg-slate-100/70">SubTotal</th>
                    <th className="py-2.5 px-2 w-20 text-right text-blue-700">MFR</th>
                    <th className="py-2.5 px-2 w-20 text-right text-blue-700">CRT</th>
                    <th className="py-2.5 px-2 w-24 text-right bg-slate-100/70">Pre-Tax</th>
                    <th className="py-2.5 px-2 w-20 text-right text-purple-700">EB</th>
                    <th className="py-2.5 px-2 w-20 text-right text-purple-700">Ibotta</th>
                    <th className="py-2.5 px-2 w-20 text-right text-purple-700">Other</th>
                    <th className="py-2.5 px-3 w-24 text-right bg-slate-100/70">Profit</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeCvs.rows.map((r, idx) => {
                    const sub = parseNum(r.price) * parseNum(r.count) * parseNum(r.percentage);
                    const beforeTax = sub - parseNum(r.mfr) - parseNum(r.crt);
                    const rowTax = Math.max(0, sub - parseNum(r.crt)) * parseNum(activeCvs.taxRate);
                    const afterTax = beforeTax + rowTax;
                    const rowProfit = parseNum(r.eb) + parseNum(r.ibotta) + parseNum(r.other) - afterTax;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-1.5 px-3"><input type="text" value={r.product || ''} onChange={(e) => updateCvsRow(idx, 'product', e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 font-medium" placeholder="Item" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.price} onChange={(e) => updateCvsRow(idx, 'price', e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.count} onChange={(e) => updateCvsRow(idx, 'count', e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.percentage} onChange={(e) => updateCvsRow(idx, 'percentage', e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2 text-right font-mono bg-slate-50/70">{sub.toFixed(2)}</td>
                        <td className="p-1.5 px-2"><input type="text" value={r.mfr} onChange={(e) => updateCvsRow(idx, 'mfr', e.target.value)} className="w-full rounded border border-blue-200 bg-blue-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.crt} onChange={(e) => updateCvsRow(idx, 'crt', e.target.value)} className="w-full rounded border border-blue-200 bg-blue-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2 text-right font-mono bg-slate-50/70">{beforeTax.toFixed(2)}</td>
                        <td className="p-1.5 px-2"><input type="text" value={r.eb} onChange={(e) => updateCvsRow(idx, 'eb', e.target.value)} className="w-full rounded border border-purple-200 bg-purple-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.ibotta} onChange={(e) => updateCvsRow(idx, 'ibotta', e.target.value)} className="w-full rounded border border-purple-200 bg-purple-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-2"><input type="text" value={r.other} onChange={(e) => updateCvsRow(idx, 'other', e.target.value)} className="w-full rounded border border-purple-200 bg-purple-50/20 px-1.5 py-1 text-right font-mono" /></td>
                        <td className={`p-1.5 px-3 text-right font-mono bg-slate-50/70 ${profitClass(rowProfit)}`}>{fmtMoney(rowProfit)}</td>
                        <td className="p-1.5 px-2 text-center"><button onClick={() => removeCvsRow(idx)} className="text-slate-400 hover:text-rose-600 font-bold text-base">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ==================== TAB 3: FRY'S WEEKLY DEALS ==================== */}
        {state.activeTab === 'frys' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-800">Fry's Weekly Deals</h2>
                <p className="text-xs text-slate-500">Buy & Receive status across accounts</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={addFrysDeal} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm">+ Add Deal</button>
                <button onClick={addFrysAccount} className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold">+ Add Account</button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th rowSpan="2" className="py-2.5 px-3 min-w-[150px] bg-slate-100 border-r border-slate-200 sticky left-0 z-10">Weekly Deal</th>
                    {state.frys.accounts.map((acc, aIdx) => (
                      <th key={acc.id} colSpan="2" className="py-2 px-1.5 text-center border-r border-slate-200 min-w-[120px] bg-slate-50">
                        <div className="flex items-center justify-between gap-1">
                          <input type="text" value={acc.email} onChange={(e) => updateFrysAccount(aIdx, 'email', e.target.value)} placeholder="Account" className="w-full text-center font-semibold bg-transparent text-xs" />
                          <button onClick={() => removeFrysAccount(aIdx)} className="text-slate-300 hover:text-rose-500 text-sm px-1">×</button>
                        </div>
                        <input type="text" value={acc.phone} onChange={(e) => updateFrysAccount(aIdx, 'phone', e.target.value)} placeholder="Phone" className="w-full text-center font-mono text-[11px] text-slate-500 bg-transparent mt-0.5" />
                      </th>
                    ))}
                    <th rowSpan="2" className="py-2.5 px-2.5 text-center bg-slate-100 min-w-[85px]">Progress</th>
                  </tr>
                  <tr className="text-[11px] text-slate-500 bg-slate-100/70">
                    {state.frys.accounts.map((acc) => (
                      <React.Fragment key={acc.id}>
                        <th className="py-1.5 px-1 text-center border-r border-slate-100">Buy</th>
                        <th className="py-1.5 px-1 text-center border-r border-slate-200">Rec</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.frys.deals.map((deal, dIdx) => {
                    let buyCount = 0, recCount = 0;
                    state.frys.accounts.forEach((acc) => {
                      const st = deal.status[acc.id] || {};
                      if (st.buy) buyCount++;
                      if (st.receive) recCount++;
                    });
                    return (
                      <tr key={deal.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-2.5 bg-white border-r border-slate-200 sticky left-0 z-10 font-semibold">
                          <div className="flex items-center justify-between gap-1">
                            <input type="text" value={deal.name} onChange={(e) => updateFrysDealName(dIdx, e.target.value)} className="w-full bg-transparent font-semibold text-xs" />
                            <button onClick={() => removeFrysDeal(dIdx)} className="text-slate-300 hover:text-rose-500 font-bold text-sm px-1">×</button>
                          </div>
                        </td>
                        {state.frys.accounts.map((acc) => {
                          const st = deal.status[acc.id] || { buy: false, receive: false };
                          const bg = st.receive ? 'bg-emerald-50/80' : st.buy ? 'bg-amber-50/80' : '';
                          return (
                            <React.Fragment key={acc.id}>
                              <td className={`py-3 px-1 text-center border-r border-slate-100 ${bg}`}>
                                <input type="checkbox" checked={!!st.buy} onChange={(e) => toggleFrysStatus(dIdx, acc.id, 'buy', e.target.checked)} className="w-4 h-4 cursor-pointer" />
                              </td>
                              <td className={`py-3 px-1 text-center border-r border-slate-200 ${bg}`}>
                                <input type="checkbox" checked={!!st.receive} onChange={(e) => toggleFrysStatus(dIdx, acc.id, 'receive', e.target.checked)} className="w-4 h-4 cursor-pointer" />
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="py-2.5 px-2 text-center font-mono text-[11px]">
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">{buyCount}B / {recCount}R</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ==================== TAB 4: REVIEWS ==================== */}
        {state.activeTab === 'review' && (
          <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Account: Bo</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{boCnt} items</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Paid / Refunded</div>
                    <div className="text-sm font-mono font-semibold text-slate-700 mt-0.5">{fmtMoney(boCost)} / {fmtMoney(boRec)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Net Diff</div>
                    <div className={`text-xl font-bold font-mono ${profitClass(boDiff)}`}>{fmtMoney(boDiff)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Account: Star</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">{starCnt} items</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Paid / Refunded</div>
                    <div className="text-sm font-mono font-semibold text-slate-700 mt-0.5">{fmtMoney(starCost)} / {fmtMoney(starRec)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Net Diff</div>
                    <div className={`text-xl font-bold font-mono ${profitClass(starDiff)}`}>{fmtMoney(starDiff)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Combined & Unpaid</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium">{pendingCnt} unpaid</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Pending Refund</div>
                    <div className="text-sm font-mono font-semibold text-rose-600 mt-0.5">{fmtMoney(pendingAmt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Total Net Diff</div>
                    <div className={`text-xl font-bold font-mono ${profitClass(allDiff)}`}>{fmtMoney(allDiff)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {['Bo', 'Star', 'ALL'].map((acc) => (
                    <button
                      key={acc}
                      onClick={() => setState((prev) => ({ ...prev, reviewAccountFilter: acc }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        state.reviewAccountFilter === acc ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {acc === 'ALL' ? 'All' : acc}
                    </button>
                  ))}
                </div>
                <button onClick={addReviewRow} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm">+ Add Entry</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="text" value={revSearch} onChange={(e) => setRevSearch(e.target.value)} placeholder="Search product..." className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" />
                <select value={revStatusFilter} onChange={(e) => setRevStatusFilter(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white">
                  <option value="ALL">All Statuses</option>
                  <option value="UNPAID">Unpaid (Refund = 0)</option>
                  <option value="UNSUBMITTED">No Submit Date</option>
                  <option value="PROFIT">Profit (+)</option>
                  <option value="LOSS">Discounted (-)</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-20">Account</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Product</th>
                    <th className="py-2.5 px-3 w-28 text-right">Paid ($)</th>
                    <th className="py-2.5 px-3 w-28 text-center">Date</th>
                    <th className="py-2.5 px-3 w-28 text-right">Refund ($)</th>
                    <th className="py-2.5 px-3 w-28 text-right bg-slate-100/70">Diff ($)</th>
                    <th className="py-2.5 px-3 w-24 text-center">Status</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReviews.map((r) => {
                    const cost = parseNum(r.cost);
                    const rec = parseNum(r.received);
                    const diff = rec - cost;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/80">
                        <td className="p-1.5 px-3">
                          <select value={r.account} onChange={(e) => updateReviewRow(r.id, 'account', e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold bg-white">
                            <option value="Bo">Bo</option>
                            <option value="Star">Star</option>
                          </select>
                        </td>
                        <td className="p-1.5 px-3"><input type="text" value={r.product || ''} onChange={(e) => updateReviewRow(r.id, 'product', e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 font-medium" /></td>
                        <td className="p-1.5 px-3"><input type="text" value={r.cost} onChange={(e) => updateReviewRow(r.id, 'cost', e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-right font-mono" /></td>
                        <td className="p-1.5 px-3"><input type="text" value={r.submitDate || ''} onChange={(e) => updateReviewRow(r.id, 'submitDate', e.target.value)} placeholder="MM/DD" className="w-full rounded border border-slate-200 px-2 py-1 text-center font-mono text-slate-600" /></td>
                        <td className="p-1.5 px-3"><input type="text" value={r.received} onChange={(e) => updateReviewRow(r.id, 'received', e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-right font-mono" /></td>
                        <td className={`p-1.5 px-3 text-right font-mono bg-slate-50/70 ${profitClass(diff)}`}>{fmtMoney(diff)}</td>
                        <td className="p-1.5 px-3 text-center">
                          {rec === 0 && cost > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold text-[11px]">Unpaid</span>
                          ) : diff > 0.004 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-[11px]">Profit</span>
                          ) : Math.abs(diff) <= 0.004 ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium text-[11px]">Even</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium text-[11px]">Discounted</span>
                          )}
                        </td>
                        <td className="p-1.5 px-2 text-center"><button onClick={() => removeReviewRow(r.id)} className="text-slate-400 hover:text-rose-600 font-bold text-base">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-800 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan="2" className="py-2.5 px-3 text-right text-slate-500">FILTERED TOTAL</td>
                    <td className="py-2.5 px-3 text-right font-mono">{fmtMoney(filteredRevCost)}</td>
                    <td></td>
                    <td className="py-2.5 px-3 text-right font-mono">{fmtMoney(filteredRevRec)}</td>
                    <td className={`py-2.5 px-3 text-right font-mono ${profitClass(filteredRevDiff)}`}>{fmtMoney(filteredRevDiff)}</td>
                    <td colSpan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}