export const columns: ColumnDef<Chat>[] = [
  {
    accessorKey: "messageCount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="메시지 수" />
    ),
    cell: ({ row }) => {
      const count = row.getValue("messageCount") as number;
      return <div className="w-full text-center">{count || 0}</div>;
    },
    enableSorting: true,
    enableHiding: true,
  },
]; 