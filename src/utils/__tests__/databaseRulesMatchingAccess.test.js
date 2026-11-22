const fs = require('fs');
const path = require('path');

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database.rules.json'), 'utf8'),
).rules;
describe('database.rules.json matching read access', () => {
  // Рівень доступу (`accessLevel`) прибрано 22.11: сканувати картки мають
  // адміни й читачі з роллю, відмінною від `ed`.
  it('no longer grants scanning by a stored access level', () => {
    expect(rules.matchingCards['.read']).not.toContain('accessLevel');
  });

  // Роль читача правила беруть з його картки стрічки: legacy `users`
  // закрито й видалено з правил.
  it('keeps admin uids and non-ed roles able to scan the matching cards', () => {
    const readRule = rules.matchingCards['.read'];
    expect(readRule).toContain("auth.uid == '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2'");
    expect(readRule).toContain("auth.uid == '0ghb1LphfASV0Y3b6J010v4CDyD2'");
    expect(readRule).toContain("root.child('matchingCards').child(auth.uid).child('role').val() != 'ed'");
  });

  it('has no legacy users node and no rule that asks it', () => {
    expect(rules.users).toBeUndefined();
    expect(JSON.stringify(rules)).not.toContain("child('users')");
  });

  it('grants ordinary matching-role access to contacts only for a dated projection', () => {
    const readRule = rules.profileContacts.$uid['.read'];
    const datedProjectionGate = "root.child('matchingCards').child($uid).child('feedDate')";

    expect(readRule).toContain(`${datedProjectionGate}.isString()`);
    expect(readRule).toContain(`${datedProjectionGate}.val().matches(/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/)`);
    // Checking only for existence would also accept the explicit `false` state.
    expect(readRule).not.toContain(`${datedProjectionGate}.exists()`);
  });
});
