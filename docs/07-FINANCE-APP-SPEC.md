# New Vines Finance / Money Management --- Planned App

Goal: lightweight offline-first personal/household/microbusiness finance
sharing NovoApps infrastructure.

Support multiple real users in a workspace (e.g. husband/wife plus a few
authorized users), each with separate identity/membership.

Core requirements: - income and expenses - accounts/cash -
categories/chart of accounts - annual/monthly/weekly budgets - budget vs
actual - view-only general-ledger-style log - offline entry - user
stamps/timestamps - synchronization

Prefer flexible Budget `start_date`/`end_date` plus budget lines; UI can
offer annual/monthly/weekly conveniences.

Source transactions are user-entered; ledger-style lines are
generated/derived and view-only. Do not require users to understand
formal double-entry bookkeeping for normal activity.

Conceptual entities: Account, Category/ChartOfAccount, Transaction,
TransactionLine/derived LedgerLine, Budget, BudgetLine. Later
possibilities: customer/vendor, debt/loan, transfer, receipt attachment.

Every synchronized record follows common
UUIDv7/workspace/audit/version/tombstone metadata and encrypted cloud
payload design.

Inventory and Finance may later interoperate without becoming
inseparable: an inventory sale may link/create income/cash activity;
purchase may link/create expense/cash activity. Use stable
IDs/events/references rather than tight UI coupling.

Prior build-version convention: `YYYYMMDD.N`; this is separate from Git
milestone tags.
