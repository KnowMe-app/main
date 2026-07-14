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
import { buildPayerLocation, buildPayerName } from './invoiceCatalogUtils';

ensurePdfFontsRegistered();

// Same paper/bronze palette as the Invoice PDF (design-tasks-3 §2): the card, rules, total card,
// and note marks reuse the exact tokens InvoicePdfDocument/pdfBaseStyles use. Staying unbranded
// (no wordmark/motif/agency footer) is a legal requirement and stays; matching colors is not.
const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  paymentCard: {
    backgroundColor: PDF_COLOR.card,
    borderRadius: 8,
    padding: 14,
  },
  paymentCardTitle: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: PDF_COLOR.bronzeDeep,
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.docLine,
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
    color: PDF_COLOR.docInk,
  },
  paymentValueCell: {
    flex: 1,
  },
  paymentValueText: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    lineHeight: 1.4,
    color: PDF_COLOR.docInk,
  },
  amountCard: {
    ...pdfBaseStyles.totalCard,
    marginTop: 22,
  },
  amountLabel: pdfBaseStyles.totalCardLabel,
  amountValue: {
    ...pdfBaseStyles.totalCardAmount,
    fontSize: 26,
  },
  amountSub: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    color: PDF_COLOR.card,
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
    color: PDF_COLOR.bronze,
  },
  noteText: {
    flex: 1,
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    lineHeight: 1.45,
    color: PDF_COLOR.inkSoft,
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
              next to the wire instructions they actually govern, not on the itemized invoice. */}
          <View style={styles.noteRow}>
            <Text style={styles.noteMark}>*</Text>
            <Text style={styles.noteText}>
              Purpose of the payment must be exactly like in invoice.
            </Text>
          </View>
          <View style={styles.noteRow}>
            <Text style={styles.noteMark}>**</Text>
            <Text style={styles.noteText}>
              Please make sure you pay the whole amount. Do not use SHA option while making payment.
            </Text>
          </View>
        </View>

        {/* Own, independent page numbering - "Page 1 of 1" for a one-page document (spec §3) -
            never a continuation of the Invoice's own numbering. */}
        <Footer variant="neutral" />
      </Page>
    </Document>
  );
};

export default PaymentDetailsPdfDocument;
