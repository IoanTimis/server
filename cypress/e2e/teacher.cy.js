describe("Teacher Topics API", () => {
  beforeEach(() => {
    cy.fixture("topic").as("topicData"); 
  });

  it("Should return teacher topics", function () {
    cy.request({
      method: "GET",
      url: "/teacher/fetch/topics",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property("topics");
      expect(response.body.topics).to.be.an("array");
    });
  });

  it("Should successfully add a topic", function () {
    cy.request({
      method: "POST",
      url: "/teacher/topic/add",
      body: this.topicData,
      headers: { Authorization: "Bearer mockValidToken" } 
    }).then((response) => {
      expect(response.status).to.eq(201);
      expect(response.body).to.have.property("topic");
      expect(response.body.topic).to.have.property("title", this.topicData.title);
    });
  });
});
