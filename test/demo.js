function calculateDiscount(price, userTier, promoCode, isFirstPurchase) {
  let discount = 0;

  if (userTier === 'gold') {
    discount = 0.2;
  } else if (userTier === 'silver') {
    discount = 0.1;
  } else {
    discount = 0.05;
  }

  if (promoCode === 'SAVE10') {
    discount += 0.10;
  } else if (promoCode === 'HALFOFF') {
    discount = Math.max(discount, 0.5);
  }

  if (isFirstPurchase) {
    discount = Math.min(discount + 0.05, 0.6);
  }

  if (discount > 0.6) discount = 0.6;

  return price * (1 - discount);
}

function validateEmail(email) {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
}

function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    data: items.slice(start, end),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
    hasNext: end < items.length,
    hasPrev: page > 1
  };
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

module.exports = { calculateDiscount, validateEmail, paginate, debounce };
