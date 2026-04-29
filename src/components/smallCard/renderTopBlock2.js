import React, { useMemo, useState } from 'react';
import { formatDateToDisplay } from 'components/inputValidations';
import { normalizeRegion } from '../normalizeLocation';

const styles = {
  card: {
    width: '100%',
    background: 'linear-gradient(160deg, #1e2d3d 0%, #162030 100%)',
    borderRadius: '20px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  topBlock: { padding: '14px 14px 10px', position: 'relative' },
  zoneRow: { display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '12px' },
  zoneBtn: (color, active) => ({ flex: '1', height: '38px', borderRadius: '10px', border: 'none', backgroundColor: color, boxShadow: active ? `0 0 0 2px rgba(255,255,255,0.4), 0 4px 12px ${color}99` : `0 3px 8px ${color}55`, color: '#fff' }),
  metaRow: { fontSize: '10px', color: '#7a8fa6', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' },
  idLink: { color: '#4a9eda', textDecoration: 'none', fontWeight: 500 },
  badge: (bg, color) => ({ display: 'inline-block', padding: '1px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 600, background: bg, color }),
  divider: { height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)', margin: '10px 0' },
  nameText: { fontSize: '17px', fontWeight: 700, color: '#e8f0fa', lineHeight: 1.2 },
  identityMeta: { fontSize: '11px', color: '#8fa8c0', marginTop: '3px', display: 'flex', gap: '6px', flexWrap: 'wrap' },
  region: { fontSize: '11px', color: '#6a8299', marginTop: '2px' },
  commentArea: { background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px 10px', marginTop: '6px' },
  commentLabel: { fontSize: '9px', color: '#556677', textTransform: 'uppercase', marginBottom: '4px' },
  commentText: { fontSize: '11px', color: '#c8daea', fontStyle: 'italic', lineHeight: 1.45 },
};

const ZONE_COLORS = ['#d32f2f', '#ef6c00', '#f9a825', '#2e7d32', '#0288d1', '#1565c0', '#6a1b9a'];

const TopBlock2 = ({ userData }) => {
  const [activeZone, setActiveZone] = useState(null);
  const fullName = useMemo(() => [userData?.surname, userData?.name, userData?.fathersname].filter(Boolean).join(' '), [userData]);
  const birth = formatDateToDisplay(userData?.birth);
  const region = normalizeRegion(userData?.region || userData?.city || userData?.location || '');

  return (
    <div style={styles.card}>
      <div style={styles.topBlock}>
        <div style={styles.zoneRow}>
          {ZONE_COLORS.map((color, idx) => (
            <button
              key={color}
              type="button"
              style={{ ...styles.zoneBtn(color, activeZone === idx), opacity: idx >= 5 ? 0.28 : 1, cursor: idx >= 5 ? 'default' : 'pointer' }}
              onClick={() => idx < 5 && setActiveZone(idx === activeZone ? null : idx)}
            >
              •
            </button>
          ))}
        </div>

        <div style={styles.metaRow}>
          <span>{userData?.lastAction || ''}</span><span>·</span>
          <a href="#" style={styles.idLink} onClick={e => e.preventDefault()}>{userData?.userId || '—'}</a>
          {userData?.getInTouch && <><span>·</span><span style={styles.badge('rgba(0,136,209,0.18)', '#4ab3e8')}>Звʼязатись: {userData.getInTouch}</span></>}
        </div>

        <div style={styles.divider} />
        <div style={styles.nameText}>{fullName || '—'}</div>
        <div style={styles.identityMeta}>
          {birth && <span>{birth}</span>}
          {userData?.blood && <span>{userData.blood}</span>}
          {userData?.maritalStatus && <span>{userData.maritalStatus}</span>}
        </div>
        {region && <div style={styles.region}>📍 {region}</div>}

        <div style={styles.divider} />
        <div style={styles.commentArea}>
          <div style={styles.commentLabel}>Коментар</div>
          <div style={styles.commentText}>{userData?.myComment || userData?.comment || '—'}</div>
        </div>
      </div>
    </div>
  );
};

export const renderTopBlock2 = userData => <TopBlock2 userData={userData} />;
