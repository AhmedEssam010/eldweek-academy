type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => React.ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
};

export function DataTable<T>({ columns, rows, rowKey }: DataTableProps<T>) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-surface">
      <div className="w-full max-w-full overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-white/5 text-white/60">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-3 text-start font-medium sm:px-4 ${column.className ?? ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-t border-white/8 text-white/90"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`max-w-[16rem] break-words px-3 py-3 align-middle sm:px-4 ${column.className ?? ""}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
