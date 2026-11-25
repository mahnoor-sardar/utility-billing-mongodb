const d = db.getSiblingDB('utility_billing');
d.payments.drop(); d.bills.drop();
print('Dropped payments and bills. Remaining bills: ' + d.bills.countDocuments() + ', payments: ' + d.payments.countDocuments());
