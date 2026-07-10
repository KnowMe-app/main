// Payment Details - a standalone document (spec §3), split out of what used to be page 2 of the
// Invoice PDF. The beneficiary (a sole proprietorship) is a legally separate party from the
// UKRCOM agency, so this document deliberately carries no UKRCOM wordmark/motif/agency footer
// (variant="neutral" throughout) and gets its own page numbering starting at "Page 1 of 1" -
// nothing here should read as "page 2 of the invoice".
import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  Footer, PDF_COLOR, PDF_FONT, ensurePdfFontsRegistered, pdfBaseStyles, sanitizePdfText,
} from './pdfTheme';
import { formatMoney } from './budgetCatalogUtils';
import { buildPayerLocation, buildPayerName, STANDARD_PAYMENT_CAVEATS } from './invoiceCatalogUtils';

ensurePdfFontsRegistered();

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  paymentCard: {
    backgroundColor: PDF_COLOR.neutralBg,
    borderWidth: 1,
    borderColor: PDF_COLOR.neutralLine,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: 14,
  },
  paymentCardTitle: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: PDF_COLOR.neutralSoft,
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.neutralLine,
    borderTopStyle: 'solid',
    paddingVertical: 6,
  },
  paymentRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  paymentLabelCell: {
    width: '32%',
  },
  paymentLabelText: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    color: PDF_COLOR.neutralInk,
  },
  paymentValueCell: {
    flex: 1,
  },
  paymentValueText: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    lineHeight: 1.4,
    color: PDF_COLOR.neutralInk,
  },
  amountCard: {
    backgroundColor: PDF_COLOR.neutralTotal,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginTop: 22,
  },
  amountLabel: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 1.4,
    color: PDF_COLOR.neutralSoft,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  amountValue: {
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontSize: 26,
    color: PDF_COLOR.white,
  },
  amountSub: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    color: PDF_COLOR.neutralBg,
    marginTop: 4,
  },
  noteRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  noteMark: {
    width: 16,
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    color: PDF_COLOR.neutralSoft,
  },
  noteText: {
    flex: 1,
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    lineHeight: 1.45,
    color: PDF_COLOR.neutralInk,
  },
});

const PaymentDetailsPdfDocument = ({
  beneficiary,
  customers,
  invoiceNumber,
  purposeOfPayment,
  amountDue,
}) => {
  const payerName = buildPayerName(customers);
  const payerLocation = buildPayerLocation(customers);

  return (
    <Document title={`Payment Details ${invoiceNumber || ''}`} subject="Payment details" creator="UKRCOM">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment details</Text>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentCardTitle}>Beneficiary details</Text>
            <View style={[styles.paymentRow, styles.paymentRowFirst]}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Beneficiary</Text></View>
              <View style={styles.paymentValueCell}>
                <Text style={styles.paymentValueText}>
                  {sanitizePdfText(`${beneficiary?.title || ''}, ${beneficiary?.address || ''}`)}
                </Text>
              </View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>IBAN</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(beneficiary?.iban)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Bank</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(beneficiary?.bankName)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>SWIFT/BIC</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(beneficiary?.swiftCode)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Payer</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(payerName)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Location</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(payerLocation)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Purpose of payment</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(purposeOfPayment)}</Text></View>
            </View>
          </View>

          {/* Amount due is generated together with, and always kept in sync with, the matching
              Invoice (spec §3) - it is simply passed in as a prop rather than recomputed here. */}
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Amount due</Text>
            <Text style={styles.amountValue}>{formatMoney(amountDue)}</Text>
            <Text style={styles.amountSub}>{sanitizePdfText(`See Invoice No. ${invoiceNumber || ''} for the full breakdown.`)}</Text>
          </View>

          {/* These payment caveats used to live on the Invoice PDF itself - they belong here,
              next to the wire instructions they actually govern, not on the itemized invoice.
              InvoiceBuilderPage.jsx drops the same text from the Invoice's own notes whenever
              this document is generated alongside it, so they're never shown twice. */}
          {STANDARD_PAYMENT_CAVEATS.map((caveat, index) => (
            <View key={caveat} style={styles.noteRow}>
              <Text style={styles.noteMark}>{'*'.repeat(index + 1)}</Text>
              <Text style={styles.noteText}>{sanitizePdfText(caveat)}</Text>
            </View>
          ))}
        </View>

        {/* Own, independent page numbering - "Page 1 of 1" for a one-page document (spec §3) -
            never a continuation of the Invoice's own numbering. */}
        <Footer variant="neutral" />
      </Page>
    </Document>
  );
};

export default PaymentDetailsPdfDocument;
