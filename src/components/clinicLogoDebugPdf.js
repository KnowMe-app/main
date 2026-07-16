// A tiny standalone PDF, downloaded automatically right after a clinic logo upload, that reports
// exactly what happened at each step of the pipeline the real Documents PDF depends on later
// (Storage round-trip fetch, then the @react-pdf re-encode). The admin testing this is usually on
// a phone with no access to devtools, so this is the only way for them to see real error codes.
import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, fontFamily: 'Helvetica' },
  heading: { fontSize: 14, fontWeight: 700, marginBottom: 14 },
  row: { marginBottom: 3 },
  label: { fontWeight: 700 },
  ok: { color: '#1a7a3c' },
  error: { color: '#b00020' },
  image: { marginTop: 12, maxWidth: 280, maxHeight: 280, objectFit: 'contain' },
  imageMissing: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: '#b00020' },
});

const DebugRow = ({ label, value, tone }) => (
  <View style={styles.row}>
    <Text>
      <Text style={styles.label}>{label}: </Text>
      <Text style={tone ? styles[tone] : undefined}>{String(value ?? '—')}</Text>
    </Text>
  </View>
);

const ClinicLogoDebugPdfDocument = ({ entry }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.heading}>Clinic logo upload debug</Text>
      <DebugRow label="Uploaded at" value={entry.uploadedAt} />
      <DebugRow label="Clinic ID" value={entry.clinicId} />
      <DebugRow label="File name" value={entry.fileName} />
      <DebugRow label="Storage path" value={entry.storagePath} />
      <DebugRow label="Original file" value={entry.originalFile} />
      <DebugRow label="Original dimensions (px)" value={entry.originalDimensions} />
      <DebugRow
        label="Storage round-trip fetch"
        value={entry.fetchOk ? 'OK' : `FAILED - ${entry.fetchError}`}
        tone={entry.fetchOk ? 'ok' : 'error'}
      />
      <DebugRow
        label="PDF re-encode (canvas)"
        value={entry.fetchOk ? (entry.reencoded ? 'applied' : 'skipped (unchanged)') : 'n/a'}
        tone={entry.fetchOk ? 'ok' : undefined}
      />
      <DebugRow label="Final dimensions (px)" value={entry.finalDimensions} />
      {entry.previewSrc ? (
        <Image src={entry.previewSrc} style={styles.image} />
      ) : (
        <View style={styles.imageMissing}>
          <Text style={styles.error}>No image could be embedded - the Documents PDF would show no logo either.</Text>
        </View>
      )}
    </Page>
  </Document>
);

export default ClinicLogoDebugPdfDocument;
