document.addEventListener('DOMContentLoaded', () => {
       // Add to Cart functionality
       document.querySelectorAll('.add-to-cart').forEach(button => {
           button.addEventListener('click', async function () {
               const productId = this.closest('.card').getAttribute('data-product-id');
   
               try {
                   const response = await fetch(`/cart/add/${productId}`, { method: 'POST' });
   
                   if (!response.ok) {
                       throw new Error(`HTTP error! Status: ${response.status}`);
                   }
   
                   const data = await response.json();
                   toastr.success('Product added to cart successfully!');
                   updateCartCount();
               } catch (error) {
                   console.error('Error adding product to cart:', error);
                   toastr.error('An error occurred while adding the product to the cart.');
               }
           });
       });
   
       // View Details functionality
       document.querySelectorAll('.view-details').forEach(button => {
           button.addEventListener('click', function () {
               const card = this.closest('.card');
               const productId = card.getAttribute('data-product-id');
   
               fetch(`/products/${productId}`)
                   .then(response => response.json())
                   .then(product => {
                       document.getElementById('product-name').textContent = product.name;
                       document.getElementById('product-description').textContent = product.description;
                       document.getElementById('product-price').textContent = `KES ${product.price.toFixed(2)}`;
                       document.getElementById('product-image').src = product.imageUrl;
                       new bootstrap.Modal(document.getElementById('productModal')).show();
                   })
                   .catch(error => {
                       console.error('Error fetching product details:', error);
                       toastr.error('An error occurred while fetching product details.');
                   });
           });
       });
   
       // Function to fetch and update cart count
       function updateCartCount() {
           fetch('/cart-count', {
               method: 'GET',
               credentials: 'same-origin'
           })
           .then(response => {
               if (!response.ok) {
                   throw new Error('Failed to fetch cart count');
               }
               return response.json();
           })
           .then(data => {
               if (data.cartCount !== undefined) {
                   document.getElementById('cart-count').textContent = data.cartCount;
               } else {
                   console.error('Error: Cart count not found');
               }
           })
           .catch(error => {
               console.error('Error fetching cart count:', error);
           });
       }
   
       // Initial cart count update
       updateCartCount();
   });