describe("Student API Tests", () => {
  beforeEach(() => {
      cy.fixture("student").then((studentData) => {
          cy.wrap(studentData).as("student");
      });
  });

  it("Should return available student topics", function () {
      cy.request({
          method: "GET",
          url: "/student/fetch/topics", 
          headers: {  
              Authorization: `Bearer ${this.student.validAccessToken}` 
          }
      }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body).to.have.property("topics");
      });
  });

  it("Should add a topic to favorites", function () {
      cy.request({
          method: "POST",
          url: `/student/favorite/add/${this.student.validTopicId}`,
          headers: {  
              Authorization: `Bearer ${this.student.validAccessToken}` 
          }
      }).then((response) => {
          expect(response.status).to.eq(201);
          expect(response.body.message).to.eq("Favorite topic added");
      });
  });

  it("Should fail to add a non-existent topic to favorites", function () {
      cy.request({
          method: "POST",
          url: `/student/favorite/add/9999`,
          headers: {  
              Authorization: `Bearer ${this.student.validAccessToken}` 
          },
          failOnStatusCode: false
      }).then((response) => {
          expect(response.status).to.eq(404);
          expect(response.body.message).to.eq("Topic not found");
      });
  });
});
