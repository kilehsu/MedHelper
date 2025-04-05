const axios = require('axios');

const upc = '367877438306';
const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`;

axios.get(url)
  .then(response => {
    console.log(response.data.items[0]); // Includes size, title, etc.
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
