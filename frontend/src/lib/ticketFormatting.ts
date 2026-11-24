export function formatTicketCode(ticketNumber: number) {
  const sequence = ticketNumber - 99_999;
  return `${String(sequence).padStart(6, "0")}A`;
}
