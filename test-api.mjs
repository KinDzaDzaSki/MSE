async function testAPI() {
  console.log('Testing /api/stocks endpoint...');
  
  try {
    const response = await fetch('http://localhost:3000/api/stocks');
    console.log('Response status:', response.status);
    
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2).substring(0, 500));
    
    if (data.success && data.data.stocks && data.data.stocks.length > 0) {
      console.log(`✅ SUCCESS! Found ${data.data.stocks.length} stocks`);
      console.log('First 3 stocks:');
      data.data.stocks.slice(0, 3).forEach(stock => {
        console.log(`  ${stock.symbol}: ${stock.price} MKD`);
      });
    } else {
      console.log('⚠️ No stocks returned');
      console.log('Success:', data.success);
      console.log('Stock count:', data.data?.stocks?.length);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAPI();
