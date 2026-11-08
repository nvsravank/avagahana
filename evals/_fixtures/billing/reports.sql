-- Unpaid invoices past their due date, by customer
SELECT c.name, i.id, i.due_on, i.total - coalesce(sum(p.amount), 0) AS outstanding
FROM invoices i
JOIN customers c ON c.id = i.customer_id
LEFT JOIN payments p ON p.invoice_id = i.id
WHERE i.status = 'sent' AND i.due_on < current_date
GROUP BY c.name, i.id, i.due_on, i.total
HAVING i.total - coalesce(sum(p.amount), 0) > 0;

-- Revenue by product per month
SELECT date_trunc('month', i.issued_on) AS month, pr.name, sum(l.amount) AS revenue
FROM invoice_lines l
JOIN invoices i ON i.id = l.invoice_id
JOIN products pr ON pr.id = l.product_id
WHERE i.status IN ('sent', 'paid')
GROUP BY 1, 2;
