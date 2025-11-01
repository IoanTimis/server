describe('Auth API Tests with Fixtures', () => {
  beforeEach(() => {
      cy.fixture('auth').then((authData) => {
          cy.wrap(authData).as('auth'); 
      });
  });

  it('Should successfully log in with valid credentials', function () {
      cy.request('POST', '/login', this.auth.validUser)
        .then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('accessToken');
        });
  });

  it('Should fail login with invalid password', function () {
      cy.request({
          method: 'POST',
          url: '/login',
          body: this.auth.invalidUser,
          failOnStatusCode: false
      }).then((response) => {
          expect(response.status).to.eq(204);
          expect(response.body.error).to.eq('Invalid email or password');
      });
  });

  it('Should fail login with invalid email', function () {
      cy.request({
          method: 'POST',
          url: '/login',
          body: this.auth.invalidEmail,
          failOnStatusCode: false
      }).then((response) => {
          expect(response.status).to.eq(204);
          expect(response.body.error).to.eq('Invalid email or password');
      });
  });
});
