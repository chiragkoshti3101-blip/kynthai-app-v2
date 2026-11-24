/** Browser-safe identity document choices; no server cryptography imports. */
export const ID_DOCUMENT_TYPES = [
  { value: 'drivers_license', label: "Driver's licence / driving ID" },
  { value: 'national_id', label: 'National ID / government ID card' },
  { value: 'passport', label: 'Passport' },
  { value: 'other', label: 'Other Government ID' },
] as const;
