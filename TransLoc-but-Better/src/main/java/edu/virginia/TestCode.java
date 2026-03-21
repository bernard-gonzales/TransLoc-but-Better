package edu.virginia;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import tools.jackson.databind.ObjectMapper;

public class TestCode {

  public static void main(String[] args) {

    String baseUrl = "https://uva.transloc.com";
    String apiUrl = baseUrl + "/Services/JSONPRelay.svc/GetMapVehiclePoints?APIKey=8882812681";

    try (HttpClient client = HttpClient.newHttpClient()) {
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(apiUrl))
          .GET()
          .build();
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
      ObjectMapper mapper = new ObjectMapper();
      List<LinkedHashMap> buses = mapper.readValue(response.body(), List.class);
      for (LinkedHashMap bus : buses) {
        System.out.println(bus);
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
  }
}