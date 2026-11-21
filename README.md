# North America Lighting — demo storefront

A static demo catalog and order-request site for **North America Lighting LLC**, a Dallas commercial LED lighting wholesaler.

This is a demonstration site. Checkout does not collect payment. Submitting an order opens an email to `naltx75247@gmail.com` with the request, shows an on-page confirmation with an order number, and saves the order in the browser (`localStorage`). An invoice and payment instructions follow offline.

## Local preview

Serve the folder over HTTP (opening `index.html` as a file will not load the catalog):

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

## Notes

- Product data was exported from the Square catalog for this demo.
- The Square “Shipping” POS line is not shown as a product.
- Items without a fixed price appear as “Call for price / request quote”.
- `#/admin` lists orders placed in this browser only.
